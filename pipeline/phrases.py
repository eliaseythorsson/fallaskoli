# -*- coding: utf-8 -*-
"""Kinds of subordinate clause and kinds of phrase (item 28, years 9-10).

Two annotations are added to a sentence here, and both follow the rule of the
whole build: **a wrong question is worse than no question**. Nothing below
asserts an analysis on the strength of one source. A clause or a phrase is
written into the data only when two things that do not depend on each other
say the same:

  1. the PARSE: Greynir's tree has a node of that kind over exactly these
     words (CP-ADV-TEMP, PP, NP-SUBJ ...), and
  2. the WORDS: a closed table of what such a clause or phrase looks like —
     the conjunction that opens the clause, the word classes inside the
     phrase.

Where they disagree, or where school grammars disagree among themselves, the
clause or phrase is simply not recorded, and nothing is ever asked about it.
The lists of what is left out, and why, are in docs/CURRICULUM.md.

    rec['cl']   [{'a': first, 'b': last, 't': kind, 'n': 1?}, ...]
                subordinate clauses with a kind; 'n' marks one that has
                another finite clause inside it
    rec['ph']   [{'a': first, 'b': last, 't': 'nl'|'fl'|'al'|'sl', 'i': 1?}, ...]
                phrases; 'i' marks a nafnliður that stands inside a
                forsetningarliður (*á [gamla borðinu]*)

Indices are token indices of rec['tok'].
"""

import parse_guard

PUNCT = ('.', '!', '?', ',', ':', ';', '„', '“', '"')


def tree_spans(tree):
    """(tag, first, last) for every phrase of the tree, outermost first."""
    out = []

    def walk(node):
        if node is None:
            return []
        if node.is_terminal:
            i = getattr(node, 'index', None)
            return [] if i is None else [i]
        idx = []
        here = len(out)
        tag = getattr(node, 'tag', None)
        if tag:
            out.append(None)                 # keep the outermost-first order
        for ch in node.children:
            idx += walk(ch)
        if tag:
            out[here] = (tag, min(idx), max(idx)) if idx else None
        return idx
    walk(tree)
    return [x for x in out if x]


# --------------------------------------------------------------------------
# Kinds of subordinate clause
# --------------------------------------------------------------------------

# What opens a clause of each kind. A tuple is the words in order, lower case.
# This is the table in Handbók um málfræði and Málvísir, cut down to the
# conjunctions that have ONE reading:
#
#   left out on purpose
#   *þar sem*    cause ("þar sem snjórinn var mikill") or place ("svæði þar
#                sem engir vegir eru"); the parser calls both a cause
#   *sem* (st)   comparison, not a relative clause
#   *síðan*, *fyrst*, *úr því að*, *því að*, *enda*   rare here, and each has
#                a second reading as an adverb or a main-clause conjunction
#   *svo* alone  "svo allir skildu það": purpose or result, and not *svo að*
#   *að* after *því* / *þess* / *það* other than af því, vegna þess, til þess
#                ("trúði því að ..."): the clause stands with a pronoun, and
#                books differ on what to call it
#   *en*, *eins og*   samanburðarsetningar: nearly all of them in the bank are
#                phrases without a verb ("stærri en hinn")
OPENERS = {
    'tíðarsetning': [('þegar',), ('áður', 'en'), ('eftir', 'að'), ('á meðan',),
                     ('meðan',), ('þangað', 'til'), ('um', 'leið', 'og'),
                     ('um leið', 'og'), ('fyrr', 'en')],
    'skilyrðissetning': [('ef',), ('nema',)],
    'viðurkenningarsetning': [('þótt',), ('þó', 'að'), ('enda', 'þótt')],
    'tilvísunarsetning': [('sem',)],
    'spurnarsetning': [('hvort',), ('hver',), ('hvað',), ('hvar',), ('hvenær',),
                       ('hvernig',), ('hvert',), ('hvaðan',), ('hvaða',),
                       ('af', 'hverju'), ('af hverju',), ('hversu',)],
}
TAG_KIND = {'CP-ADV-TEMP': 'tíðarsetning', 'CP-ADV-COND': 'skilyrðissetning',
            'CP-ADV-ACK': 'viðurkenningarsetning', 'CP-REL': 'tilvísunarsetning',
            'CP-QUE': 'spurnarsetning'}

# Two words before *að* that make a three-word conjunction with it. The parse
# starts the clause at *að*; build_sentences.tidy_clauses has already moved
# the clause boundary for the two causal ones.
BEFORE_AD = {('af', 'því'): 'orsakarsetning', ('vegna', 'þess'): 'orsakarsetning'}

# *til þess að* is the conjunction of purpose — unless the *til* belongs to
# what stands before it: "Ég hlakka til þess að sumarið komi" is not a
# purpose. After these words *til þess að* is never taken as a conjunction.
# (The list is deliberately wider than the bank needs.)
TIL_GOVERNORS = {'hlakka', 'ætlast', 'vonast', 'langa', 'finna', 'koma', 'leiða',
                 'verða', 'þurfa', 'nægja', 'duga', 'nógur', 'nóg', 'bjóða', 'hvetja',
                 'benda', 'vísa', 'líta', 'segja', 'grípa', 'ná', 'stofna', 'efna',
                 'ástæða', 'tími', 'tækifæri', 'leyfi', 'tilefni', 'vilji', 'löngun'}


def til_thess_opens_clause(toks, a):
    """Is the *til þess* before the *að* at index `a` part of the conjunction
    *til þess að*? Not if a word that takes *til* stands in the clause before
    it. Used by build_sentences.tidy_clauses too, so that the clause boundary
    (`k`) and the kind recorded here cannot disagree."""
    if a < 2 or (toks[a - 2]['w'].lower(), toks[a - 1]['w'].lower()) != ('til', 'þess'):
        return False
    return not any((toks[j].get('l') or '').lower() in TIL_GOVERNORS for j in range(0, a - 2))
# A plain *að*-clause is a skýringarsetning only when *að* is not the tail of
# something else. These words before it make it part of a longer conjunction
# or of a construction the books name differently.
NOT_BEFORE_AD = {'því', 'þess', 'það', 'svo', 'þó', 'til', 'eftir', 'án', 'með',
                 'enda', 'nema', 'þannig', 'um', 'fyrir', 'frá', 'við', 'á', 'í'}


WHEN_NOT_AFTER = ('muna', 'dagur', 'tími', 'ár', 'stund', 'kvöld', 'morgunn', 'nótt',
                  'vika', 'vetur', 'sumar', 'haust', 'vor', 'augnablik', 'skipti')
SO_WORDS = ('svo', 'svona', 'þannig', 'slíkur')


def _lower(t):
    return t['w'].lower()


def _opens(toks, a, words):
    for k, w in enumerate(words):
        if a + k >= len(toks) or _lower(toks[a + k]) != w:
            return False
    return True


def _finite_moods(toks, a, b, inner):
    """The moods of the finite verbs that belong to this clause itself (not
    to a clause inside it), and whether each one is settled by its form."""
    out = []
    for j in range(a, b + 1):
        if any(x <= j <= y for (x, y) in inner):
            continue
        t = toks[j]
        mood = parse_guard.mood_of(t.get('m'))
        if t['x'] == 'so' and mood in ('FH', 'VH') and not t.get('rj'):
            out.append((mood, 'háttur' not in (t.get('u') or [])))
    return out


def classify_clauses(toks, spans):
    """The subordinate clauses of a sentence whose KIND is certain."""
    n = len(toks)
    word = lambda i: toks[i]['w'] not in PUNCT
    last_word = max((i for i in range(n) if word(i)), default=-1)
    cps = [(tag, a, b) for (tag, a, b) in spans if tag.startswith('CP-')]
    infs = [(a, b) for (tag, a, b) in spans if tag.startswith('IP-INF')]
    out = []
    for tag, a, b in cps:
        a0, b0 = a, b                         # the node's own span
        base = tag
        for suffix in ('-OBJ', '-SUBJ', '-PRD', '-IOBJ'):
            if base.endswith(suffix):
                base = base[:-len(suffix)]
        # The negation before the conjunction is the main clause's ("Ég veit
        # [ekki] hvort ..."): tidy_clauses rule c.
        while a < b and _lower(toks[a]) in ('ekki', 'aldrei') and toks[a].get('k') == 'aðalsetning':
            a += 1
        kind = None
        if base == 'CP-THT':
            if _lower(toks[a]) != 'að' or toks[a]['x'] != 'st':
                continue
            two = (_lower(toks[a - 2]), _lower(toks[a - 1])) if a >= 2 else None
            if two == ('til', 'þess'):
                if not til_thess_opens_clause(toks, a):
                    continue
                kind = 'til þess að'
                a -= 2
            elif two in BEFORE_AD:
                kind = BEFORE_AD[two]
                a -= 2
            elif a >= 1 and _lower(toks[a - 1]) in NOT_BEFORE_AD:
                continue
            elif any(_lower(toks[j]) in SO_WORDS for j in range(0, a)):
                # "var svo löng að fáir náðu að klára hana": with *svo*,
                # *svona* or *þannig* before it the að-clause is a result
                # (afleiðingarsetning), and the parse does not say so.
                continue
            else:
                kind = 'skýringarsetning'
        elif base in ('CP-ADV-PURP', 'CP-ADV-CONS'):
            # *svo að*: purpose with the subjunctive, result with the
            # indicative. Decided below, by the mood; the tag has to agree.
            if _opens(toks, a, ('svo', 'að')):
                kind = 'svo að'
            elif _opens(toks, a, ('til', 'þess', 'að')):
                kind = 'til þess að'         # the parser's own purpose clause
            else:
                continue
        elif base in TAG_KIND:
            kind = TAG_KIND[base]
            if not any(_opens(toks, a, w) for w in OPENERS[kind]):
                continue
            if kind == 'tilvísunarsetning' and toks[a]['x'] != 'stt':
                continue
            if kind == 'spurnarsetning' and _lower(toks[a]) != 'hvort' \
                    and toks[a].get('l') not in ('hver', 'hvað', 'hvar', 'hvenær', 'hvernig',
                                                 'hvert', 'hvaðan', 'hvaða', 'af', 'af hverju',
                                                 'hversu'):
                continue
        else:
            continue

        # ---- the span must be what the clause annotation (`k`) says too ----
        # `k` was tidied by build_sentences.tidy_clauses and checked by the
        # guard; the node is the parser's. Where the two draw the clause
        # differently and no rule below explains it, the clause is left out.
        k = lambda j: toks[j].get('k')
        if any(word(j) and k(j) == 'aðalsetning' for j in range(a, b + 1)):
            continue
        # A verb whose analysis the guard withdrew says nothing reliable about
        # the clause. (The conjunction may be withdrawn — *svo* and *þó* are,
        # as word classes — because it is matched as a WORD, in the table.)
        if any(toks[j].get('rj') and toks[j]['x'] == 'so' for j in range(a, b + 1)):
            continue
        in_cp = lambda j: any(x <= j <= y for (_t, x, y) in cps if not (x == a0 and y == b0))
        nested = any(x <= a0 and y >= b0 and (x, y) != (a0, b0) for (_t, x, y) in cps)
        # Words trailing the clause that `k` gives to it and no other clause
        # claims ("að þið séuð komin [allt of seint]", "Þegar ég kom heim [úr
        # skólanum] sá ég ..."): tidy_clauses rule e. They are the clause's —
        # unless it stands inside another clause that ends at the same word,
        # for then they could be either's, and this clause is left out.
        j = b + 1
        while j < n and word(j) and k(j) == 'aukasetning' and not in_cp(j) \
                and toks[j]['x'] not in ('st', 'stt') \
                and not (toks[j]['x'] == 'so'
                         and parse_guard.mood_of(toks[j].get('m')) in ('FH', 'VH')):
            j += 1
        if j - 1 > b:
            if nested:
                continue
            b = j - 1
        # What stands right before must be another clause's or the main
        # clause's: a subordinate word that no clause of the parse covers
        # means the clause does not begin where the node says.
        prev = next((j for j in range(a - 1, -1, -1) if word(j)), None)
        if prev is not None and k(prev) == 'aukasetning' and not in_cp(prev):
            continue
        # What stands right after must be the main clause, the end of the
        # sentence, or the rest of a clause this one stands inside. Another
        # subordinate or infinitive clause straight after it may well belong
        # INSIDE it ("[af hverju hann sagði ekki frá því] að hann væri
        # veikur", "[að henni hefði verið sagt] að bíða"): where the parser
        # hung it is the least reliable thing in a parse, and a clause shown
        # without its tail is shown wrongly. Such a clause is left out.
        after = next((j for j in range(b + 1, n) if word(j)), None)
        if after is not None and k(after) != 'aðalsetning':
            if not any(x <= a0 and y >= after for (_t, x, y) in cps if (x, y) != (a0, b0)):
                continue
            # Inside another clause, that clause must visibly go on with its
            # own finite verb ("að þeim [sem skiluðu á réttum tíma] yrði
            # leyft"). Anything else after it could be this clause's own
            # tail, hung one level up: "tvo bræður [sem byggju] í öðru landi".
            ta = toks[after]
            if not (ta['x'] == 'so' and parse_guard.mood_of(ta.get('m')) in ('FH', 'VH')):
                continue

        inner = [(t_, x, y) for (t_, x, y) in cps if x > a0 and y <= b
                 and any(toks[i]['x'] == 'so' and parse_guard.mood_of(toks[i].get('m')) in ('FH', 'VH')
                         for i in range(x, y + 1))]
        # An adverbial clause at the very end of this one may be the main
        # clause's instead ("Okkur var sýnt [hvernig brauð er bakað áður en
        # við fengum að smakka það]"): the extent is then not certain.
        if any(y == b and t_.startswith('CP-ADV') for (t_, x, y) in inner):
            continue
        inner = [(x, y) for (_t, x, y) in inner]
        # An infinitive clause inside a relative clause may be the main
        # verb's ("bað þá [sem höfðu lokið verkefninu að hjálpa hinum]").
        if kind == 'tilvísunarsetning' and any(k(j) == 'nafnháttarsetning' for j in range(a, b + 1)):
            continue
        # *þegar* after a noun of time ("deginum þegar við fluttum") or as
        # what is remembered or told about ("Ég man þegar ...", "frá því
        # þegar ...") is not plainly an adverbial clause of time.
        if kind == 'tíðarsetning' and _lower(toks[a]) == 'þegar' and prev is not None and \
                (toks[prev].get('l') in WHEN_NOT_AFTER or _lower(toks[prev]) in ('því', 'eftir', 'frá')):
            continue
        moods = _finite_moods(toks, a, b, inner)
        if not moods:
            continue                          # a clause has a finite verb
        if kind in ('svo að', 'til þess að'):
            # Purpose has the subjunctive, result the indicative; that is the
            # whole difference between the two *svo að*, and the parser does
            # not make it (it calls both CP-ADV-PURP). So every finite verb
            # of the clause must SHOW its mood, and all the same one. Inside
            # another clause (indirect speech) the subjunctive may be that
            # clause's doing and proves nothing: left out.
            if nested or not all(firm for (_m, firm) in moods) or len({m for (m, _f) in moods}) != 1:
                continue
            mood = moods[0][0]
            if mood == 'VH':
                kind = 'tilgangssetning'
            elif mood == 'FH' and kind == 'svo að':
                kind = 'afleiðingarsetning'
            else:
                continue
        rec = {'a': a, 'b': b, 't': kind}
        if inner:
            rec['n'] = 1
        out.append(rec)
    # one record per span: a tree can carry the same clause under two tags
    seen, uniq = set(), []
    for r in sorted(out, key=lambda r: (r['a'], -r['b'])):
        if (r['a'], r['b']) not in seen:
            seen.add((r['a'], r['b']))
            uniq.append(r)
    return uniq


# --------------------------------------------------------------------------
# Phrases: nafnliður, forsetningarliður, atviksliður, sagnliður
# --------------------------------------------------------------------------

NOMINAL = ('no', 'fn', 'pfn', 'abfn', 'lo', 'to', 'töl', 'raðnr', 'gr',
           'person', 'entity', 'sérnafn')
HEADS = ('no', 'pfn', 'person', 'entity', 'sérnafn')
NP_TAGS = ('NP-SUBJ', 'NP-OBJ', 'NP-IOBJ', 'NP-PRD')
ADVP_TAGS = ('ADVP', 'ADVP-TMP-SET')
JOINERS = ('og', 'eða', 'en', 'sem', 'né', 'þar')     # *þar*: "um svæði þar sem ..."
# A pronoun that only points forward to a clause: "frá því þegar hún var lítil",
# "eftir því að ...". The clause belongs to the phrase, so it has no certain end.
POINTERS = ('því', 'þess', 'það')
NOT_AL = ('hvar', 'hvenær', 'hvernig', 'hvert', 'hvaðan', 'hversu', 'áfram')


def _plain(t):
    """A token whose word class stands: not withdrawn, not several words."""
    return bool(t.get('c')) and not t.get('rj')


def phrases(toks, spans, clause_unsure, only_adverb=lambda w: True):
    """The phrases of a sentence whose kind AND extent are certain.

    What is recorded, and what is not:

      fl  a PP of the parse that is one preposition (with a government the
          guard confirmed) and then nominals only. A preposition with an
          adverb before it ("út í garð"), a time expression the parser files
          as an adverbial ("í dag", "á morgun") and a PP with another phrase
          or a clause inside are left out: whether those are one phrase, and
          of which kind, is where the books differ.
      nl  a subject, object, indirect object or noun predicative of the
          parse whose role the build confirmed, or the nominals after the
          preposition of a recorded fl,
          made of nominals only, with a noun or personal pronoun in it, and
          not continued by a word that could belong to it (a nominal, a
          preposition, *og*, *sem*).
      al  one adverb on its own, where the parse has an adverbial phrase of
          exactly that word, BÍN knows the word only as an adverb, and its
          neighbours are not words it could modify or belong with. Not
          *ekki*, not the direction particles ("stóð upp").
      sl  the predicate of a one-clause sentence that begins with its
          subject: from the finite verb to the last word, with something
          after the verb (Málvísir: "sögn ásamt andlagi eða fyllilið").
    """
    n = len(toks)
    word = lambda i: 0 <= i < n and toks[i]['w'] not in PUNCT
    x = lambda i: toks[i]['x'] if word(i) else None
    out = []

    def nominal_run(a, b):
        return all(_plain(toks[j]) and toks[j]['x'] in NOMINAL for j in range(a, b + 1))

    fl = set()
    for tag, a, b in spans:
        if tag != 'PP' or b - a < 1:
            continue
        p = toks[a]
        if p.get('c') != 'forsetning' or not p.get('pg') or p.get('rj'):
            continue
        if not nominal_run(a + 1, b) or not any(toks[j]['x'] in HEADS + ('fn', 'abfn')
                                                for j in range(a + 1, b + 1)):
            continue
        if x(a - 1) in ('ao', 'fs') or x(b + 1) in NOMINAL or \
                (word(b + 1) and toks[b + 1]['w'].lower() in JOINERS):
            continue
        if b - a == 1 and toks[b]['w'].lower() in POINTERS and word(b + 1):
            continue
        fl.add((a, b))
        out.append({'a': a, 'b': b, 't': 'fl'})

    for tag, a, b in spans:
        inside = (a - 1, b) in fl
        if not (tag in NP_TAGS or (tag == 'NP' and inside)):
            continue
        if not nominal_run(a, b) or not any(toks[j]['x'] in HEADS for j in range(a, b + 1)):
            continue
        # One nafnliður has one head. Two nouns side by side that are not
        # head and genitive attribute (*þak hússins*) are two phrases the
        # parser ran together: "Ég gaf [litla barninu mjólk] að drekka".
        if sum(1 for j in range(a, b + 1) if toks[j]['x'] == 'no'
               and 'EF' not in (toks[j].get('m') or '')) > 1:
            continue
        if not inside:
            # The head must carry a role the build CONFIRMED (subject, object,
            # predicative: `r`). "Hundurinn gelti [alla nóttina]" comes from
            # the parser as an object; it is an adverbial of time, which by
            # form is a nafnliður and by function an atviksliður — the books
            # differ, so it is not asked. The role check leaves it out.
            if not any(toks[j]['x'] in HEADS and toks[j].get('r') for j in range(a, b + 1)):
                continue
            # The dummy *það* ("Það var hált úti") is no one's idea of a phrase.
            if a == b and toks[a]['w'].lower() == 'það':
                continue
            if x(a - 1) in NOMINAL + ('fs',) or x(b + 1) in NOMINAL + ('fs',):
                continue
            if word(b + 1) and toks[b + 1]['w'].lower() in JOINERS:
                continue
            if word(a - 1) and toks[a - 1]['w'].lower() in JOINERS[:2]:
                continue
        elif b - a < 1:
            continue                         # one word after a preposition
        rec = {'a': a, 'b': b, 't': 'nl'}
        if inside:
            rec['i'] = 1
        out.append(rec)

    pps = [(a, b) for (tag, a, b) in spans if tag == 'PP']
    for tag, a, b in spans:
        if tag not in ADVP_TAGS or a != b:
            continue
        t = toks[a]
        if t['x'] != 'ao' or t.get('c') != 'atviksorð' or t.get('rj') or ' ' in t['w']:
            continue
        if any(p <= a <= q for (p, q) in pps):
            continue
        if x(a + 1) in ('lo', 'ao', 'fs', 'eo') or x(a - 1) in ('ao', 'fs', 'eo'):
            continue
        # Nothing in the build checks the class of an uninflected word, and
        # the parser does file *allt* and *ekkert* as adverbs now and then.
        # So the word must be one BÍN knows ONLY as an adverb (*hér, oft,
        # heima, strax*): that also keeps out the neuter adjective used as an
        # adverb (*hratt, hægt*), which some books call a lýsingarorð, and
        # the particle that is also a preposition (*fór af, sneri við*).
        if not only_adverb(t['w']):
            continue
        # A question word that opens a clause ("spurði [hvar] ég hefði
        # verið") and the particle of *halda áfram* are adverbs, and nobody's
        # first example of an atviksliður: left out.
        if t['w'].lower() in NOT_AL:
            continue
        out.append({'a': a, 'b': b, 't': 'al'})

    # sagnliður
    last = max((i for i in range(n) if word(i)), default=-1)
    one_clause = not clause_unsure and last >= 2 and toks[-1]['w'] == '.' and \
        all(toks[j].get('k') == 'aðalsetning' for j in range(n)) and \
        not any(toks[j]['x'] in ('st', 'stt') for j in range(n))
    if one_clause:
        subj = [(a, b) for (tag, a, b) in spans if tag == 'NP-SUBJ']
        if len(subj) == 1 and subj[0][0] == 0 and nominal_run(*subj[0]):
            v = subj[0][1] + 1
            tv = toks[v] if v <= last else None
            finite = [j for j in range(n) if toks[j]['x'] == 'so' and
                      parse_guard.mood_of(toks[j].get('m')) in ('FH', 'VH')]
            if tv is not None and finite == [v] and tv.get('r') == 'umsögn' \
                    and not tv.get('rj') and last > v \
                    and all(toks[j].get('c') or ' ' in toks[j]['w'] for j in range(v, last + 1)):
                out.append({'a': v, 'b': last, 't': 'sl'})

    seen, uniq = set(), []
    for r in sorted(out, key=lambda r: (r['a'], r['b'], r['t'])):
        if (r['a'], r['b']) not in seen:
            seen.add((r['a'], r['b']))
            uniq.append(r)
    return uniq
