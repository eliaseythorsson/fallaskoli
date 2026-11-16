# -*- coding: utf-8 -*-
"""How hard a word is to inflect, and how hard a cell is: the second axis of
difficulty (critique item 16).

Until v6.13 "difficulty" was the length of the sentence. But *maður*,
*fjörður*, *kýr* and *bók* are harder than *hestur* in a sentence of any
length, and the genitive plural is harder than the accusative singular. This
module scores both at build time; build_lexicon.py writes the result into
lexicon.json and the app chooses on both axes (src/js/core/difficulty.js
`hardnessWeight`, src/js/tasks/shared.js `wordWeight` / `cellEase`).

WHERE THE SCORES LIVE (one place each, so that critique item 17 — calibration
from real answers — can later overwrite them):

    lexicon.json  w[i].irr      1-5, the word's irregularity (nouns,
                                adjectives, verbs; closed classes have none)
    lexicon.json  cellh[key]    one digit 1-5 per cell, in the order of
                                orders[key] ('no', 'lo', 'so', 'fn', 'pfn')

------------------------------------------------------------------------------
THE WORD SCORE: measured on the BÍN paradigm, not listed by hand
------------------------------------------------------------------------------

1. Each form of a few telling cells has its inflectional ending taken off.
   The endings a cell may carry are listed per cell (NOUN_ENDINGS …); where a
   form allows more than one cut (*hestur* = hest+ur or hestu+r) the cuts
   are chosen so that the paradigm has as FEW stems as possible, i.e. in
   favour of regularity. What is left is the paradigm's set of stems:

       hestur   {hest}                    maður   {mað, mann, menn, mönn}
       dagur    {dag, deg, dög}           fjörður {fjörð, firð, fjarð}

2. The stems are compared with each other, and each kind of alternation
   found is worth points (POINTS below):

       U  u-umlaut          a ~ ö (saga/sögu, barn/börn), and a ~ u in an
                            unstressed syllable (sumar/sumur, banani/bönunum)
       S  syncope           an unstressed vowel dropped (hamar/hamri)
       J  -ja / -va stem    a j or v that comes and goes (bekkur/bekkjar,
                            söngur/söngvar, telja/taldi)
       I  another vowel     i-umlaut, breaking, ablaut (bók/bækur,
          alternation       fjörður/firði); more for three vowels than two
       C  consonant change  the consonants of the stem change (maður/manni,
                            góður/betri, standa/stóð)

   and so are three things read off the endings:

       P  consonant-stem    a masculine or strong feminine with the plural in
          plural            -ur, -r or no ending (bækur, fætur, menn, kýr,
                            fingur) — the "irregular plurals"
       R  r-stem            faðir/föður, móðir, bróðir, systir, dóttir
       K  contracted        a stem ending in a vowel, dative plural in -m
                            (skóm, trjám, kúm, ám)

   and one read off the cells:

       V  variants / gaps   a telling cell with two correct forms, or a
                            paradigm with a hole in it (a plural or a tense
                            only partly there)

   Nouns and adjectives:   irr = 1 + points, at most 5.
   Verbs are placed by conjugation first (BÍN does not name the class; it is
   read off the past tense as tasks/sagnord.js `verbConjugation` does):

       weak, past in -aði, one stem                    1   borða, byrja
       weak, another dental (-ði -di -ti), or u-umlaut  2   heyra, tala, kalla
       weak with a vowel change or a j that goes        3   telja, spyrja
       … and a consonant change or three vowels         4   sækja, þykja
       mixed: a weak-looking past, but the present
         singular has another vowel than the
         infinitive, or the past ends in -ri            4   hafa, ná, snúa
       strong (ablaut)                                  4   bíta, gráta
       strong with four or more root vowels, or a
         consonant change                               5   fara, standa
       preterite-present (hand list, see OVERRIDES)     5   eiga, kunna

3. OVERRIDES is the hand list, and it is short on purpose: only what the
   measurement cannot see. Everything else is whatever BÍN's forms say.

What the score is NOT: it does not say a word is rare (that is `r`/`q`), long,
or semantically hard. A closed-class word (pronoun, article, numeral) gets no
score: those classes are small, nearly all suppletive, and are taught word
by word; the app treats a missing score as neutral.

------------------------------------------------------------------------------
THE CELL SCORE: a documented table
------------------------------------------------------------------------------

See NOUN_CELL, ADJ_DEGREE, VERB_CELL below. It is a teacher's ordering, not a
measurement: the nominative is the form on the card, the accusative is
usually the bare stem, the dative and genitive carry endings that differ by
class, and the plural and the article each add one more thing to get right.
Item 17 is meant to replace these numbers with what pupils actually get
wrong.
"""
import re

# ---------------------------------------------------------------------------
# letters
# ---------------------------------------------------------------------------
VOWELS = 'aáeéiíoóuúyýæö'
_NUCLEUS = re.compile('(au|ei|ey|[%s])' % VOWELS)


def split(stem):
    """A stem as (consonant clusters, vowel nuclei): 'fjörð' -> (['f','rð'],
    ['jö']). A j right before a vowel belongs to the vowel (breaking:
    fjörð/firð/fjarð have the same consonants), and a doubled consonant
    counts once (legg/lag, hitt/hit)."""
    parts = _NUCLEUS.split(stem)            # cons, V, cons, V, …, cons
    cons, nuc = parts[0::2], parts[1::2]
    cons = list(cons)
    nuc = list(nuc)
    for k in range(len(nuc)):
        if cons[k].endswith('j') and k < len(cons):
            cons[k] = cons[k][:-1]
            nuc[k] = 'j' + nuc[k]
    cons = [re.sub(r'(.)\1', r'\1', c) for c in cons]
    return cons, nuc


# ---------------------------------------------------------------------------
# 1. stems: take the ending off, in favour of regularity
# ---------------------------------------------------------------------------
def cuts(form, endings):
    """Every stem this form could have, given the endings its cell allows,
    as {stem: plain}. The bare form is always one of them. A stem keeps at
    least one vowel. An ending written 'x>y' is a replacement: the supine
    *sent* is send+t, so 't>d' offers the stem *send* (plain = False)."""
    out = {form: True}
    for e in endings:
        if '>' in e:
            a, b = e.split('>')
            if form.endswith(a):
                out.setdefault(form[:-len(a)] + b, False)
        elif e and form.endswith(e):
            s = form[:-len(e)]
            if s and _NUCLEUS.search(s):
                out[s] = True
    return out


def stems(cells):
    """cells: [(form, endings)] -> (the fewest stems that cover every form,
    {form index: (stem, ending)}). Greedy set cover: the stem that explains
    most forms first. Ties, in this order: the stem whose consonants most
    forms could share (ký-r beside kú, not kýr; gát-um, not gá-tum; try-ði
    beside trú-ði, not tryð-i); a plain cut before a replacement; among
    stems shared by several forms, one that ends in a consonant (kall-a,
    not kalla-); the shorter one (dög-um); then alphabetically, so the
    build is reproducible."""
    cand = [cuts(f, e) for f, e in cells]
    skel = lambda s: ''.join(split(s)[0])
    support = {}
    for c in cand:
        for k in {skel(s) for s in c}:
            support[k] = support.get(k, 0) + 1
    left = set(range(len(cells)))
    chosen, where = [], {}
    while left:
        count, plain = {}, {}
        for i in left:
            for s, p in cand[i].items():
                count[s] = count.get(s, 0) + 1
                plain[s] = plain.get(s, False) or p
        best = sorted(count, key=lambda s: (
            -count[s], -support[skel(s)], not plain[s],
            count[s] > 1 and s[-1] in VOWELS, len(s), s))[0]
        chosen.append(best)
        for i in sorted(left):
            if best in cand[i]:
                where[i] = (best, cells[i][0][len(best):] if cells[i][0].startswith(best) else '')
                left.discard(i)
    return chosen, where


# ---------------------------------------------------------------------------
# 2. what kind of alternation the stems show
# ---------------------------------------------------------------------------
def alternations(stem_list):
    """The set of flags among U S J I C, and how many vowels alternate in
    the worst position (for I)."""
    flags, worst = set(), 0
    S = sorted(set(stem_list))
    if len(S) < 2:
        return flags, worst
    # J: a stem-final j or v that the other stems lack (bekkj/bekk, söngv/söng)
    bare = set(S)
    for s in list(S):
        if s[-1] in 'jv' and len(s) > 2 and any(
                t != s and split(t)[0] == split(s[:-1])[0] for t in S):
            flags.add('J')
            bare.discard(s)
            bare.add(s[:-1])
    S = sorted(bare)
    # S, with the vowel still there: dapur, fögur beside dapr-an — the u
    # before a stem-final r is the vowel that comes and goes.
    for s in list(S):
        twin = any(t != s and split(t)[0] == split(s)[0]
                   and len(split(t)[1]) == len(split(s)[1]) for t in S)
        # (not *sumur*: it stands beside *sumar*, and that pair is u-umlaut)
        if not twin and len(s) > 3 and s.endswith('ur') and s[-3] not in VOWELS and any(
                t != s and split(t)[0] in (split(s[:-2])[0], split(s[:-2] + 'r')[0])
                for t in S):
            flags.add('S')
            bare.discard(s)
            bare.add(s[:-2])
    S = sorted(bare)
    # S, first kind: a stem-final r after a consonant that the other stems
    # lack — vetr-i beside vet-ur, systr-um beside syst-ir. The u or i before
    # the r is the vowel that comes and goes.
    for s in list(S):
        if len(s) > 2 and s[-1] == 'r' and s[-2] not in VOWELS and any(
                t != s and split(t)[0] == split(s[:-1])[0] for t in S):
            flags.add('S')
            bare.discard(s)
            bare.add(s[:-1])
    S = sorted(bare)
    if len(S) < 2:
        return flags, worst
    sp = [split(s) for s in S]
    # S: syncope — the same consonants, one unstressed vowel fewer
    n = max(len(nuc) for _, nuc in sp)
    if any(len(nuc) == n - 1 for _, nuc in sp) and n >= 2:
        short = [(c, v) for c, v in sp if len(v) == n - 1]
        fixed, dropped = [], set()
        for c, v in sp:
            if len(v) == n and v[-1] in ('a', 'u', 'i', 'e') and len(c) >= 2:
                merged = c[:-2] + [re.sub(r'(.)\1', r'\1', c[-2] + c[-1])]
                if any(''.join(merged) == ''.join(sc) for sc, _ in short):
                    flags.add('S')
                    dropped.add(v[-1])
                    fixed.append((merged, v[:-1]))
                    continue
            fixed.append((c, v))
        if 'a' in dropped and 'u' in dropped:
            flags.add('U')                       # sumar / sumur beside sumr-i
        sp = fixed
    skeletons = {''.join(c) for c, _ in sp}
    lengths = {len(v) for _, v in sp}
    if len(skeletons) > 1 or len(lengths) > 1:
        flags.add('C')
        # the vowels may change as well (maður/menn); compare the root vowel
        firsts = {v[0].lstrip('j') for _, v in sp if v}
        if 'ö' in firsts and 'a' in firsts:
            flags.add('U')
            firsts.discard('ö')
        if len(firsts) > 1:
            flags.add('I')
            worst = max(worst, len(firsts))
        return flags, worst
    for pos in range(lengths.pop()):
        V = {v[pos].lstrip('j') for _, v in sp}
        if len(V) < 2:
            continue
        if 'a' in V and 'ö' in V:
            flags.add('U')
            V.discard('ö')
        if pos > 0 and 'a' in V and 'u' in V:
            flags.add('U')
            V.discard('u')
        if len(V) > 1:
            flags.add('I')
            worst = max(worst, len(V))
    return flags, worst


POINTS = {'U': 1, 'S': 1, 'J': 1, 'C': 3, 'P': 1, 'R': 2, 'K': 1, 'V': 1}
# I: two vowels alternate -> 2, three or more -> 3
I_POINTS = {2: 2}
I_MAX = 3


def _points(flags, worst):
    p = sum(POINTS[f] for f in flags if f in POINTS)
    if 'I' in flags:
        p += I_POINTS.get(worst, I_MAX)
    return p


def _first(cell):
    return cell.split('|')[0] if cell else ''


# ---------------------------------------------------------------------------
# nouns
# ---------------------------------------------------------------------------
# The endings each indefinite cell may carry, all genders together. The
# assimilated nominative (stól-l, stein-n) is 'l'/'n' and only after l/n.
NOUN_CELLS = ['NFET', 'ÞFET', 'ÞGFET', 'EFET', 'NFFT', 'ÞFFT', 'ÞGFFT', 'EFFT']
NOUN_ENDINGS = {
    'NFET': ['ur', 'ir', 'r', 'i', 'a'],
    'ÞFET': ['i', 'a', 'u', 'ur'],
    'ÞGFET': ['i', 'a', 'u', 'ur'],
    'EFET': ['s', 'is', 'ar', 'a', 'u', 'ur', 'r'],
    'NFFT': ['ar', 'ir', 'ur', 'r'],
    'ÞFFT': ['a', 'i', 'ar', 'ir', 'ur', 'r', 'u'],
    'ÞGFFT': ['um', 'm'],
    'EFFT': ['a', 'na'],
}
# A neuter has no plural in -ur or -ar: *sumur* is sumar with u-umlaut, not
# sum+ur.
NEUTER_PLURAL = ['u', 'i']


def noun(cells, gender):
    """cells: {mark: 'form|variant'} of one noun -> (irr, flags as a string)."""
    forms = [(m, _first(cells.get(m, ''))) for m in NOUN_CELLS]
    have = [(m, f) for m, f in forms if f]
    spec = []
    for m, f in have:
        e = list(NOUN_ENDINGS[m])
        if gender == 'hk' and m in ('NFFT', 'ÞFFT'):
            e = NEUTER_PLURAL
        if m == 'NFET' and re.search(r'(ll|nn)$', f):
            e.append(f[-1])                      # stól-l, stein-n, jökul-l
        spec.append((f, e))
    chosen, where = stems(spec)
    flags, worst = alternations(chosen)
    end = {have[i][0]: where[i][1] for i in where}
    st = {have[i][0]: where[i][0] for i in where}
    weak_fem = gender == 'kvk' and end.get('NFET') == 'a'
    # (not skrá-r, á-r: after a vowel the -r is the ordinary -ar, contracted;
    # that is K. *klær*, *kýr*, *brýr* change their vowel as well and count.)
    open_stem = st.get('NFFT', 'x')[-1] in VOWELS
    if gender in ('kk', 'kvk') and not weak_fem and 'NFFT' in end \
            and end['NFFT'] in ('ur', 'r', '') and ('I' in flags or not open_stem):
        flags.add('P')
    if end.get('NFET') == 'ir' and end.get('EFET') == 'ur':
        flags.add('R')
    if end.get('ÞGFFT') == 'm' and st.get('ÞGFFT', 'x')[-1] in VOWELS:
        flags.add('K')
    plural = [m for m, f in forms if m.endswith('FT') and f]
    if any('|' in cells.get(m, '') for m in NOUN_CELLS) or 0 < len(plural) < 4:
        flags.add('V')
    return min(5, 1 + _points(flags, worst)), ''.join(sorted(flags))


# ---------------------------------------------------------------------------
# adjectives
# ---------------------------------------------------------------------------
# Masculine and feminine of the strong positive, and the comparative and
# superlative. The neuter (glatt, gott, satt) is left out: its -t assimilates
# with the stem in ways an ending list cannot cut reliably.
ADJ_ENDINGS = {
    'FSB-KK-NFET': ['ur', 'r'],
    'FSB-KVK-NFET': [],
    'FSB-KK-ÞFET': ['an', 'n'],
    'FSB-KK-ÞGFET': ['um'],
    'FSB-KK-NFFT': ['ir'],
    'MST-KK-NFET': ['ari', 'rri', 'ri', 'ni', 'li', 'i'],
    'ESB-KK-NFET': ['astur', 'stur'],
}


def adjective(cells):
    have = [(m, _first(cells.get(m, ''))) for m in ADJ_ENDINGS]
    have = [(m, f) for m, f in have if f]
    spec = []
    for m, f in have:
        e = list(ADJ_ENDINGS[m])
        if m == 'FSB-KK-NFET' and re.search(r'(ll|nn)$', f):
            e.append(f[-1])                      # gamal-l, hrein-n
        spec.append((f, e))
    chosen, where = stems(spec)
    flags, worst = alternations(chosen)
    if any('|' in cells.get(m, '') for m in ADJ_ENDINGS):
        flags.add('V')
    return min(5, 1 + _points(flags, worst)), ''.join(sorted(flags))


# ---------------------------------------------------------------------------
# verbs
# ---------------------------------------------------------------------------
VERB_ENDINGS = {
    'GM-NH': ['a'],
    'GM-FH-NT-1P-ET': ['i', 'a'],
    'GM-FH-NT-3P-ET': ['ur', 'ir', 'ar', 'r'],
    'GM-FH-NT-1P-FT': ['um'],
    # the dental of the stem merges with the dental of the ending, by rule:
    # fæð-a/fæddi, lend-a/lenti, virð-a/virti. That is spelling, not a second
    # stem, so the replacement cuts ('ddi>ð') offer the stem back.
    'GM-FH-ÞT-1P-ET': ['aði', 'ði', 'di', 'ti', 'i', 'ddi>ð', 'ti>d', 'ti>ð'],
    'GM-FH-ÞT-1P-FT': ['uðum', 'ðum', 'dum', 'tum', 'um', 'ddum>ð', 'tum>d', 'tum>ð'],
    'GM-VH-ÞT-1P-ET': ['aði', 'ði', 'di', 'ti', 'i', 'ddi>ð', 'ti>d', 'ti>ð'],
    # the dental of the stem merges with the -t: send-a/sent, leið-a/leitt
    'GM-SAGNB': ['að', 'ið', 't', 'ð', 't>d', 't>ð', 'tt>ð', 'tt>dd'],
}
# A verb said only in the third person (build_lexicon.py `t3`) is measured
# on the third person.
VERB_3P = {'GM-FH-NT-1P-ET': 'GM-FH-NT-3P-ET', 'GM-FH-NT-1P-FT': 'GM-FH-NT-3P-FT',
           'GM-FH-ÞT-1P-ET': 'GM-FH-ÞT-3P-ET', 'GM-FH-ÞT-1P-FT': 'GM-FH-ÞT-3P-FT',
           'GM-VH-ÞT-1P-ET': 'GM-VH-ÞT-3P-ET'}
_WEAK_PAST = re.compile('(aði|ði|di|ti)$')


def verb(cells):
    get = lambda m: _first(cells.get(m, '')) or _first(cells.get(VERB_3P.get(m, ''), ''))
    have = [(m, get(m)) for m in VERB_ENDINGS]
    missing = [m for m, f in have if not f]
    have = [(m, f) for m, f in have if f]
    chosen, where = stems([(f, VERB_ENDINGS[m]) for m, f in have])
    flags, worst = alternations(chosen)
    st = {have[i][0]: where[i][0] for i in where}
    if any('|' in cells.get(m, '') for m in VERB_ENDINGS) or missing:
        flags.add('V')
    past = get('GM-FH-ÞT-1P-ET')
    root = lambda m: (split(st[m][:-1] if st[m][-1] in 'jv' and len(st[m]) > 2 else st[m])[1]
                      or [''])[-1].lstrip('j') if m in st else None
    inf_v, pres_v = root('GM-NH'), root('GM-FH-NT-1P-ET')
    if not past:
        kind = 'weak'                              # nothing to place it by
    elif not past.endswith('i'):
        kind = 'strong'
    elif past.endswith('ri') and not _WEAK_PAST.search(past):
        kind = 'mixed'                             # sneri, reri, greri
    elif inf_v and pres_v and inf_v != pres_v:
        kind = 'mixed'                             # hafa/hef, ná/næ, eiga/á
    else:
        kind = 'weak'
    if kind == 'strong':
        irr = 5 if ('C' in flags or worst >= 4 or
                    ('I' in flags and 'U' in flags and worst >= 3)) else 4
    elif kind == 'mixed':
        irr = 4
    else:
        dental = bool(past) and not past.endswith('aði')
        irr = 1 + (1 if (dental or 'U' in flags) else 0)
        if 'I' in flags or 'J' in flags:
            irr += 1
        if 'C' in flags or worst >= 3:
            irr += 1
        irr = max(irr, 1)
    if 'V' in flags:
        irr = min(5, irr + 1)
    return irr, {'strong': 'A', 'mixed': 'M', 'weak': ''}[kind] + ''.join(sorted(flags))


# ---------------------------------------------------------------------------
# 3. the hand list: only what the measurement cannot see
# ---------------------------------------------------------------------------
OVERRIDES = {
    # The preterite-presents (núþálegar sagnir): the present is an old past
    # (ég á, ég kann, ég veit), which no count of stems shows. The same nine
    # as PRETERITE_PRESENT in src/js/tasks/sagnord.js.
    ('eiga', 'so'): 5, ('mega', 'so'): 5, ('unna', 'so'): 5, ('kunna', 'so'): 5,
    ('muna', 'so'): 5, ('munu', 'so'): 5, ('skulu', 'so'): 5, ('þurfa', 'so'): 5,
    ('vita', 'so'): 5,
    # Suppletive: three unrelated stems (er, var, verið). Measured 5 already;
    # listed so that a change to the measurement cannot lower it.
    ('vera', 'so'): 5,
}


def score(word, orders):
    """The irregularity of one lexicon entry {o, c, f}, or None for a class
    that is not scored. Returns (irr, flags)."""
    c = word['c']
    key = {'kk': 'no', 'kvk': 'no', 'hk': 'no', 'lo': 'lo', 'so': 'so'}.get(c)
    if not key:
        return None
    cells = dict(zip(orders[key], word['f'].split(';')))
    if key == 'no':
        irr, flags = noun(cells, c)
    elif key == 'lo':
        irr, flags = adjective(cells)
    else:
        irr, flags = verb(cells)
    if (word['o'], c) in OVERRIDES:
        irr, flags = OVERRIDES[(word['o'], c)], flags + '!'
    return irr, flags


# ---------------------------------------------------------------------------
# the cell table
# ---------------------------------------------------------------------------
# Nouns (and the pronoun tables, which have the same eight cells):
#                 singular  plural
NOUN_CELL = {'NF': (1, 2),      # the form on the card; the plural has to be known
             'ÞF': (1, 3),      # usually the bare stem; plural -a/-i/-ur by class
             'ÞGF': (2, 3),     # -i or not (hesti, stól); plural always -um
             'EF': (3, 4)}      # -s or -ar by class; plural -a or -na
ARTICLE = 1                     # the suffixed article: one more thing to get right

# Adjectives: the case and number of the noun table, plus the degree.
ADJ_DEGREE = {'FSB': 0,         # strong positive: the form learnt first
              'FVB': 1,         # weak positive: the pupil must see the article
              'MST': 1,         # comparative: its own stem (stærri, betri)
              'ESB': 1,         # superlative, strong
              'EVB': 2}         # superlative, weak

# Verbs: mood and tense first.
VERB_TENSE = {('FH', 'NT'): 1,  # ég kem
              ('FH', 'ÞT'): 2,  # ég kom — the strong past has to be known
              ('VH', 'NT'): 3,  # þótt ég komi
              ('VH', 'ÞT'): 4}  # þótt ég kæmi — i-umlaut of the past plural
VERB_MIDDLE = 1                 # miðmynd: -st on top of everything else
VERB_PLURAL_2P = 1              # þið komið / komuð: the form least met
VERB_OTHER = {'GM-NH': 1, 'MM-NH': 2, 'GM-SAGNB': 3, 'MM-SAGNB': 4, 'LHNT': 2,
              'GM-BH-ET': 2, 'GM-BH-FT': 3, 'GM-BH-ST': 3,
              'LHÞT-SB-KK-NFET': 3, 'LHÞT-SB-KVK-NFET': 4, 'LHÞT-SB-HK-NFET': 3}

_CASE = re.compile('(NF|ÞGF|ÞF|EF)(ET|FT)(gr)?$')


def cell(mark):
    """The hardness 1-5 of one cell, by its BÍN mark."""
    if mark in VERB_OTHER:
        return VERB_OTHER[mark]
    m = re.match(r'(GM|MM)-(FH|VH)-(NT|ÞT)-([123])P-(ET|FT)$', mark)
    if m:
        h = VERB_TENSE[(m.group(2), m.group(3))]
        if m.group(1) == 'MM':
            h += VERB_MIDDLE
        if m.group(4) == '2' and m.group(5) == 'FT':
            h += VERB_PLURAL_2P
        return min(5, h)
    m = _CASE.search(mark)
    if not m:
        raise ValueError('no cell score for ' + mark)
    h = NOUN_CELL[m.group(1)][0 if m.group(2) == 'ET' else 1]
    if m.group(3):
        h += ARTICLE
    deg = mark.split('-')[0]
    h += ADJ_DEGREE.get(deg, 0)
    return min(5, h)


def cell_table(orders):
    """{'no': '1123…', …}: one digit per cell, in the order of orders[key]."""
    return {k: ''.join(str(cell(m)) for m in order) for k, order in orders.items()}
