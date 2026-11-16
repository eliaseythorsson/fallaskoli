# -*- coding: utf-8 -*-
"""Annotate the sentence bank with Greynir, then put every annotation through
parse_guard before it is allowed into the data.

One annotation, every exercise type. The difference from v5 is that nothing
Greynir says is taken on trust: each token's mark is confirmed against BÍN,
each government is confirmed against government.py, and any feature the
surface form cannot settle is marked uncertain so the app never asks about it.
"""
from reynir import Greynir
from islenska import Bin
import json, sentences, noun_classes, parse_guard, parse_overrides, phrases

# The parser, BÍN and the guard are built on first use, so that
# tools/try-sentences.py can annotate one candidate sentence without running
# the whole build.
g = b = guard = None


def engines():
    """Greynir, BÍN and the guard — created once, on first use."""
    global g, b, guard
    if g is None:
        g = Greynir()
        b = Bin()
        freq = json.load(open('freq_lemmas.json'))
        score = {(o, c): s for _bid, (o, c, s, _k) in freq.items()}   # the corpus score, not the rank key
        guard = parse_guard.Guard(b, overrides=parse_overrides,
                                  score=lambda lemma, ofl: score.get((lemma, ofl), 0))
    return g, b, guard

CASE = {'nf': 'NF', 'þf': 'ÞF', 'þgf': 'ÞG', 'ef': 'EF'}
CAT = {'no': 'nafnorð', 'so': 'sagnorð', 'lo': 'lýsingarorð', 'fs': 'forsetning',
       'st': 'samtenging', 'stt': 'samtenging', 'ao': 'atviksorð', 'eo': 'atviksorð',
       'nhm': 'nafnháttarmerki', 'fn': 'fornafn', 'pfn': 'fornafn', 'abfn': 'fornafn',
       'person': 'nafnorð', 'entity': 'nafnorð', 'sérnafn': 'nafnorð', 'gr': 'greinir',
       'to': 'töluorð', 'töl': 'töluorð', 'raðnr': 'töluorð', 'tala': 'töluorð',
       'uh': 'upphrópun', 'lokatákn': None, 'p': None}
ROLE = {'NP-SUBJ': 'frumlag', 'NP-OBJ': 'andlag', 'NP-IOBJ': 'óbeint andlag',
        'NP-PRD': 'sagnfylling'}

# Prepositions whose choice is settled by convention rather than by grammar, one
# noun at a time — *í búðina* but *á ströndina*. A slot standing under one of
# these is recorded (`ps`) and never substituted into. See section 6 of
# `annotate` for the whole argument.
PREP_BY_CONVENTION = ('í', 'á')

# Greynir's category -> the BÍN word class to confirm the mark against.
BIN_OFL = {'no': None, 'so': 'so', 'lo': 'lo', 'fn': 'fn', 'pfn': 'pfn',
           'abfn': 'abfn', 'gr': 'gr', 'to': 'to', 'raðnr': 'rt'}


# The words a syntactic role is asked about are the ones that carry it: the
# head of the phrase and what agrees with it. Before v6.4 the role was inherited
# by everything inside the phrase, so *hennar* in "Bíllinn hennar" was a subject,
# the verb of a relative clause was whatever its antecedent was, and a noun
# inside a prepositional phrase inside an object was an object. A role now
# belongs only to a nominal standing DIRECTLY in the role phrase, and only when
# its case is the one the role has in school grammar: a subject and a
# predicative in the nominative, an object in an oblique case, an indirect
# object in the dative. Everything else carries no role and is never asked.
NOMINAL = ('no', 'fn', 'pfn', 'abfn', 'lo', 'to', 'töl', 'raðnr', 'gr',
           'person', 'entity', 'sérnafn')
ROLE_CASES = {'frumlag': ('nf',), 'sagnfylling': ('nf',),
              'andlag': ('þf', 'þgf', 'ef'), 'óbeint andlag': ('þgf',)}

# Verbs after which *að* + infinitive is one predicate, not a clause of its own:
# "Ég er að lesa", "Ég ætla að lesa", "Ég fór að sofa", "búinn að sofna". An
# infinitive phrase governed by one of these stays in its governor's clause.
AUXILIARIES = {'vera', 'verða', 'ætla', 'eiga', 'þurfa', 'fara', 'byrja',
               'hætta', 'munu', 'skulu', 'mega', 'geta', 'kunna', 'vilja',
               'hljóta', 'búa'}


def tree_info(tree):
    """token index -> the chain of phrases it stands in, innermost last.

    Each link is (tag, id): the id tells two phrases with the same tag apart,
    which is what lets the build ask "is this noun in the SAME phrase as that
    adjective" and "is this object in the same clause as that verb"."""
    paths = {}

    def walk(node, path):
        if node is None:
            return
        t = getattr(node, 'tag', None)
        if node.is_terminal:
            i = getattr(node, 'index', None)
            if i is not None:
                paths[i] = path
            return
        here = path + [(t, id(node))] if t else path
        for ch in node.children:
            walk(ch, here)
    walk(tree, [])
    return paths


def _is_clause(tag):
    return tag == 'S-MAIN' or tag.startswith('CP-') or tag.startswith('IP') \
        or (tag.startswith('S-') and tag != 'S0')


def clause_id(path):
    """The innermost clause (IP, CP, S) a token stands in."""
    for tag, ident in reversed(path):
        if tag.startswith('IP') or tag == 'S-MAIN':
            return ident
    return None


def strict_role(path, category, variants):
    """The role of a token that stands directly in a role phrase, or None."""
    if not path or category not in NOMINAL:
        return None
    tag, _ = path[-1]
    role = ROLE.get(tag)
    if role is None:
        return None
    case = next((x for x in ('nf', 'þf', 'þgf', 'ef') if x in variants), None)
    if case is not None and case not in ROLE_CASES[role]:
        return None
    return role


def clause_kinds(paths, n):
    """token index -> aðalsetning / aukasetning / nafnháttarsetning, as parsed."""
    out = {}
    for i in range(n):
        kind = 'aðalsetning'
        for tag, _ in paths.get(i, []):
            if tag == 'S-MAIN':
                kind = 'aðalsetning'
            elif tag.startswith('IP-INF'):
                kind = 'nafnháttarsetning'
            elif tag.startswith('CP-') or (tag.startswith('S-') and tag != 'S0'):
                kind = 'aukasetning'
        out[i] = kind
    return out


def mark_of(term):
    """BÍN mark for the token, from Greynir's variants."""
    v = set(term.variants); cat = term.category
    if cat == 'no':
        c = next((CASE[x] for x in v if x in CASE), None)
        if not c:
            return None
        return f"{'ÞGF' if c == 'ÞG' else c}{'FT' if 'ft' in v else 'ET'}{'gr' if 'gr' in v else ''}"
    if cat in ('fn', 'pfn', 'abfn', 'gr', 'to'):
        c = next((CASE[x] for x in v if x in CASE), None)
        if not c:
            return None
        k = next((x.upper() for x in v if x in ('kk', 'kvk', 'hk')), None)
        num = 'FT' if 'ft' in v else 'ET'
        base = f"{'ÞGF' if c == 'ÞG' else c}{num}"
        return f"{k}-{base}" if k else base
    if cat == 'lo':
        c = next((CASE[x] for x in v if x in CASE), None)
        k = next((x.upper() for x in v if x in ('kk', 'kvk', 'hk')), None)
        if not c or not k:
            return None
        deg = 'FSB' if 'sb' in v else ('FVB' if 'vb' in v else 'FSB')
        if 'mst' in v:
            deg = 'MST'
        if 'evb' in v:
            deg = 'EVB'
        if 'esb' in v:
            deg = 'ESB'
        return f"{deg}-{k}-{'ÞGF' if c == 'ÞG' else c}{'FT' if 'ft' in v else 'ET'}"
    if cat == 'so':
        p = [x for x in ('gm', 'mm') if x in v]
        parts = [p[0].upper() if p else 'GM']
        if 'nh' in v:
            parts.append('NH')
        elif 'bh' in v:
            parts.append('BH')
        elif 'lhþt' in v:
            return 'LHÞT'
        elif 'lh' in v and 'nt' in v:
            return 'LHNT'
        elif 'sagnb' in v:
            parts.append('SAGNB')
        else:
            parts.append('VH' if 'vh' in v else 'FH')
            parts.append('ÞT' if 'þt' in v else 'NT')
            pers = next((x for x in v if x in ('p1', 'p2', 'p3')), None)
            if pers:
                parts.append(pers[1] + 'P')
            parts.append('FT' if 'ft' in v else 'ET')
        return '-'.join(parts)
    return None


def governor_case_for(toks, i):
    """If a single-case preposition governs token i, that case is settled by
    the preposition and the ambiguous surface form no longer matters."""
    import government
    for j in range(i - 1, max(-1, i - 4), -1):
        t = toks[j]
        if t.get('c') == 'forsetning':
            return government.prep_case(t.get('l') or t.get('w'))
        if t.get('c') in ('nafnorð', 'sagnorð'):
            break
    return None



def cases_allowed_here(toks, i):
    """The cases the position of token i leaves open, or None when the position
    says nothing. After a preposition: what that preposition can govern (never
    the nominative). As an object: any oblique case."""
    import government
    for j in range(i - 1, max(-1, i - 4), -1):
        t = toks[j]
        if t.get('c') == 'forsetning':
            return government.PREP_CASES.get(t.get('l') or t.get('w')) or {'þf', 'þgf', 'ef'}
        if t.get('c') in ('nafnorð', 'sagnorð'):
            break
    if toks[i].get('r') in ('andlag', 'óbeint andlag'):
        return {'þf', 'þgf', 'ef'}
    return None


BIN_CLASS_OF = {'lo': 'lo', 'fn': 'fn', 'to': 'to', 'gr': 'gr'}


def agreeing_case(i, toks, paths, guard):
    """A case settled by agreement inside the phrase: *hesta* is accusative and
    genitive, but *þrjá* beside it is accusative only, so "þrjá hesta" is.
    Returned only when a word of the same phrase has a single case in BÍN and
    it is the case the parse gave this token."""
    mine = parse_guard.case_of(toks[i].get('m'))
    if not mine or toks[i]['c'] != 'nafnorð':
        return None
    here = _np_id(paths.get(i, []))
    for j, o in enumerate(toks):
        if j == i or abs(j - i) > 2 or _np_id(paths.get(j, [])) != here:
            continue
        ofl = BIN_CLASS_OF.get(o['x'])
        if not ofl or not o.get('m'):
            continue
        cases = {parse_guard.case_of(m) for m in guard.marks_for(o['w'], o['l'], ofl)} - {None}
        if cases == {mine}:
            return mine
    return None


def expand_need(need):
    """`need` as written in sentences.py -> the list of classes the slot takes.
    "none" -> [] (the sentence keeps its own noun); None -> whatever class the
    written noun has."""
    if need is None:
        return None
    if need == "none":
        return []
    out = []
    todo = [p.strip() for p in str(need).split("|")]
    while todo:
        part = todo.pop(0)
        if part.startswith("="):
            # "=place": the class itself, without what the group of the same
            # name adds to it (buildings, rooms, towns)
            if part[1:] not in noun_classes.CLASSES:
                raise SystemExit(f"unknown class {part!r} in {need!r}")
            out.append(part[1:])
        elif part in sentences.GROUPS and part not in out:
            todo.extend(sentences.GROUPS[part].split())
            if part in noun_classes.CLASSES:
                out.append(part)
        elif part in noun_classes.CLASSES:
            out.append(part)
        else:
            raise SystemExit(f"unknown need {part!r} in {need!r}")
    seen = []
    for c in out:
        if c not in seen:
            seen.append(c)
    return seen


# A slot directly under *með* is never asked as a cloze: *koma með hundinn*
# (bring it) and *koma með hundinum* (come along with it) are both correct,
# and which one is meant depends on the noun the child is given. The sentence
# still serves every other question type, and the analysis question is safe
# because the case is read off the written form.
NO_CLOZE_UNDER = ('með',)


def _np_id(path):
    """The phrase a token stands directly in."""
    return path[-1][1] if path else None


def _gender_of_terminal(t):
    return next((x for x in t.variants if x in ('kk', 'kvk', 'hk')), None)


def refine_roles(toks, terms, paths):
    """Three places where the parse's role is not the one a teacher would give.

    1. *Það eru fjögur börn í hópnum*: the parse makes the expletive *það* the
       subject and the children a predicative. School grammar calls *það* a
       dummy and the children the subject. Neither role is asked.
    2. An "object" in a finite clause with no subject at all — *þegar skólanum
       lauk* — is the oblique subject of an impersonal verb. Not asked.
    3. An "object" in a relative clause whose form could as well be nominative
       — *bókin sem hann hefði lesið* was parsed with *hann* as the object.
    """
    by_clause = {}
    for i, tk in enumerate(toks):
        by_clause.setdefault(clause_id(paths.get(i, [])), []).append(i)
    # 0. A predicative stands with a copula. "Ég vona að veðrið batni" came out
    #    with *veðrið* as the predicative of *batni*, and "skilið gluggann eftir
    #    opinn" with *opinn* as a nominative predicative of *skilja*. Without a
    #    verb of being or seeming in the clause the role is not used.
    for cid, idx in by_clause.items():
        if any(toks[i]['c'] == 'sagnorð' and toks[i]['l'] in COPULAS for i in idx):
            continue
        for i in idx:
            if toks[i]['r'] == 'sagnfylling':
                toks[i]['r'] = None
    for cid, idx in by_clause.items():
        subj = [i for i in idx if toks[i]['r'] == 'frumlag']
        # 1. the expletive
        if len(subj) == 1 and toks[subj[0]]['w'].lower() == 'það' and any(
                toks[i]['c'] == 'sagnorð' and toks[i]['l'] in ('vera', 'verða') for i in idx):
            prd = [i for i in idx if toks[i]['r'] == 'sagnfylling']
            if prd:
                for i in subj + prd:
                    toks[i]['r'] = None
                subj = []
        if subj:
            continue
        path0 = paths.get(idx[0], [])
        tags = [t for t, _ in path0]
        infinitive = any(t.startswith('IP-INF') for t in tags)
        relative = 'CP-REL' in tags
        for i in idx:
            if toks[i]['r'] not in ('andlag', 'óbeint andlag'):
                continue
            # an object phrase of this clause, not of a clause nested in it
            if infinitive:
                continue
            if relative:
                v = set(terms[i].variants)
                if not toks[i].get('m'):
                    continue
                # could this form be a nominative too?
                if 'þf' in v and toks[i]['x'] in ('pfn', 'fn', 'no') and \
                        _could_be_nominative(toks[i]):
                    toks[i]['r'] = None
                continue
            # a finite clause with a verb but no subject: the "object" is the
            # oblique subject of an impersonal verb
            if any(toks[j]['r'] == 'umsögn' for j in idx) and not _shares_subject(idx, toks):
                toks[i]['r'] = None


def _could_be_nominative(tk):
    g, b, guard = engines()
    return any(parse_guard.case_of(m) == 'nf'
               for m in guard.marks_for(tk['w'], tk['l'], None))


def _shares_subject(idx, toks):
    """A second predicate joined by *og* shares the subject of the first:
    "sátum við í myrkrinu og sögðum draugasögur". Such a clause has no subject
    of its own and its object is a real object."""
    first = idx[0]
    for j in range(first - 1, max(-1, first - 3), -1):
        if toks[j]['c'] == 'samtenging' and toks[j]['w'].lower() in ('og', 'en', 'eða'):
            return True
    return False


# Verbs a predicative can stand with (*finna* is here for *finnast*, which the
# parser lemmatises as the middle voice of *finna*).
COPULAS = ('vera', 'verða', 'heita', 'þykja', 'finna', 'finnast', 'virðast',
           'sýnast', 'reynast', 'kallast', 'nefnast')

THIRD_PERSON = ('hann', 'hún', 'það')


def gender_unsettled(i, toks, terms, paths, guard, ofl):
    """Is the gender in this token's mark a guess?

    *gömlum* is dative plural in all three genders; in "frá gömlum bæjum" the
    noun beside it settles the question. *einhver* alone, *þeim* alone, *hin*
    in "betri en hin" have nothing beside them, and the parse picks one. The
    gender is trusted only when a noun in the same phrase — or, for a
    predicative, the subject of the clause — has that gender."""
    tk = toks[i]
    mark = tk.get('m')
    if not mark or tk['c'] not in ('lýsingarorð', 'fornafn', 'töluorð', 'greinir'):
        return False
    mine = next((p for p in mark.split('-') if p in ('KK', 'KVK', 'HK')), None)
    if tk['x'] == 'pfn':
        # the gender of a personal pronoun is its lemma; a form the three
        # lemmas share (*þeim*, *þeirra*) says nothing about it
        if tk['l'] not in THIRD_PERSON:
            return False
        shared = [l for l in THIRD_PERSON if guard.marks_for(tk['w'], l, 'pfn')]
        return len(shared) > 1 and mine is not None
    if mine is None:
        return False
    cands = guard.marks_for(tk['w'], tk['l'], ofl)
    genders = {p for c in cands for p in c.split('-') if p in ('KK', 'KVK', 'HK')}
    if len(genders) <= 1:
        return False
    path = paths.get(i, [])
    here = _np_id(path)
    for j, other in enumerate(terms):
        if j == i or other.category != 'no' or toks[j].get('rj'):
            continue
        if _np_id(paths.get(j, [])) == here:
            g = _gender_of_terminal(other)
            return (g or '').upper() != mine
    if tk.get('r') == 'sagnfylling':
        cid = clause_id(path)
        for j, other in enumerate(toks):
            if other.get('r') != 'frumlag' or clause_id(paths.get(j, [])) != cid:
                continue
            if other['x'] == 'no':
                return (_gender_of_terminal(terms[j]) or '').upper() != mine
            if other['x'] == 'pfn' and other['l'] in THIRD_PERSON:
                return {'hann': 'KK', 'hún': 'KVK', 'það': 'HK'}[other['l']] != mine
    return True


def _verifying_verbs(toks, paths, i):
    """The verbs that could govern token i: those of its own clause, in the
    active voice, with an analysis that is in use."""
    cid = clause_id(paths.get(i, []))
    return [o for j, o in enumerate(toks)
            if o['c'] == 'sagnorð' and not o.get('rj')
            and not str(o.get('m') or '').startswith('MM')
            and clause_id(paths.get(j, [])) == cid]


def strength_unsettled(i, toks, paths, guard, u):
    """Is "sterk/veik beyging" in this adjective's mark a guess?

    *nýja* is weak in "nýja húsið" and strong in "nýja skó", and the parse gave
    the second one FVB. The strength is trusted only when every BÍN reading of
    the form that fits what IS settled — the gender, and the case and number
    unless they are themselves uncertain — has the same strength."""
    tk = toks[i]
    if tk['c'] != 'lýsingarorð' or not tk.get('m') or parse_guard.strength_of(tk['m']) is None:
        return False
    cands = guard.marks_for(tk['w'], tk['l'], 'lo')
    keep = []
    for c in cands:
        if 'kyn' not in u and parse_guard.gender_of(c) != parse_guard.gender_of(tk['m']):
            continue
        if 'fall' not in u and parse_guard.case_of(c) != parse_guard.case_of(tk['m']):
            continue
        if 'tala' not in u and parse_guard.number_of(c) != parse_guard.number_of(tk['m']):
            continue
        keep.append(c)
    return len({parse_guard.strength_of(c) for c in keep} - {None}) > 1


def number_from_verb(i, toks, guard, u):
    """A subject or a predicative noun has the number of its verb.

    "Þetta eru bara orð": *orð* is NFET and NFFT, the parse said singular, and
    *eru* is plural in every reading BÍN has. Where the verb's form settles the
    number and exactly one BÍN mark of the noun fits it, that mark is the
    analysis — it is BÍN's, chosen by agreement, not written by hand."""
    tk = toks[i]
    if tk['c'] != 'nafnorð' or tk.get('r') not in ('frumlag', 'sagnfylling') or not tk.get('m'):
        return u
    vn = guard._predicate_number(toks, i)
    if vn is None:
        return u
    fits = sorted({c for c in guard.marks_for(tk['w'], tk['l'], None)
                   if parse_guard.case_of(c) == 'nf' and parse_guard.number_of(c) == vn
                   and parse_guard.definite_of(c) == parse_guard.definite_of(tk['m'])})
    if len(fits) == 1:
        tk['m'] = fits[0]
        return [f for f in u if f != 'tala']
    return u


def confirm_objects(toks, paths):
    """An object is asked about only where the table knows its verb.

    The parser makes an object of any accusative it cannot place: *hátt* in
    "talar hátt", *heim* in "fóru saman heim", *alla leið* in "hjóluðum alla
    leið". A role is therefore kept only when a verb of the same clause is in
    government.VERB_CASES and takes that case. A verb the table does not know
    is not wrong; its objects are simply not asked about.

    The indirect object has one more condition. *mjólk* in "gaf barninu mjólk
    að drekka" was made a second indirect object; a noun is one only when its
    own form is dative and nothing else."""
    import government
    for i, tk in enumerate(toks):
        if tk.get('r') not in ('andlag', 'óbeint andlag'):
            continue
        unsure = 'fall' in (tk.get('u') or [])
        case = parse_guard.case_of(tk.get('m'))
        ok = False
        for v in _verifying_verbs(toks, paths, i):
            allowed = government.VERB_CASES.get(v['l'])
            if allowed and (unsure or case is None or case in allowed):
                ok = True
                break
        if ok and tk['r'] == 'óbeint andlag' and unsure and tk['c'] == 'nafnorð':
            ok = False
        if not ok:
            tk['r'] = None


def confirm_verb_government(toks, paths):
    """Keep a verb's government only where it can be pointed at.

    Greynir reports the case frame of the verb entry it matched, and it matches
    one even when the complement is a clause: "Ég held að …" came out as
    *halda* governing the dative, "Kennarinn talar hátt" as *tala* governing the
    accusative. The question "í hvaða falli stendur andlagið?" has one right
    answer only when

      * the verb is in government.VERB_CASES with a SINGLE case (a verb with
        two objects has two answers, and a verb the table does not know is
        not verified),
      * the verb is in the active voice (*klæðast* is not *klæða*),
      * an object in exactly that case, its case settled, stands in the
        verb's own clause, and no object of the clause is in any other case,
      * and it is the last verb of its clause ("hef lesið bókina": the object
        belongs to *lesa*)."""
    import government
    for i, tk in enumerate(toks):
        if tk['c'] != 'sagnorð' or not tk.get('g'):
            continue
        table = government.VERB_CASES.get(tk['l'])
        if not table or len(table) != 1 or str(tk.get('m') or '').startswith('MM'):
            tk['g'] = None
            continue
        want = next(iter(table))
        cid = clause_id(paths.get(i, []))
        have, open_case = set(), False
        for j, o in enumerate(toks):
            if o.get('r') not in ('andlag', 'óbeint andlag'):
                continue
            if o['c'] not in ('nafnorð', 'fornafn'):
                continue
            if clause_id(paths.get(j, [])) != cid:
                continue
            if 'fall' in (o.get('u') or []):
                open_case = True
                continue
            c = parse_guard.case_of(o.get('m'))
            if c:
                have.add(c)
        later = [j for j, o in enumerate(toks) if j > i and o['c'] == 'sagnorð'
                 and clause_id(paths.get(j, [])) == cid]
        tk['g'] = [want] if (have == {want} and not open_case and not later) else None


NEGATIONS = ('ekki', 'aldrei')


# The two words that stand before *að* in a three-word causal conjunction.
# The parse makes them a prepositional phrase of the main clause and starts
# the subordinate clause at *að*; school grammar counts all three words as the
# conjunction. *vegna þess* was added with the level 6-7 sentences (v6.13),
# the first in the bank to use it.
CAUSAL_HEADS = {('af', 'því'), ('vegna', 'þess')}


def tidy_clauses(toks, paths):
    """Clause boundaries, where the parse attaches a phrase one clause too high.

    None of this decides what KIND of clause anything is — that stays the
    parser's. It only moves a boundary to where the clause visibly begins or
    ends, in five situations that are regular enough to state:

      a. *að* + infinitive after an auxiliary ("er að leita", "ætla að læra",
         "fór að sofa") is part of that predicate, not a clause.
      b. A clause with no verb in it ("stærri [en hinn]", "í sama bekk [og
         ég]") is a phrase of the clause around it.
      c. The negation before a conjunction belongs to the main clause: "Ég
         veit [ekki] hvort …".
      d. *af því* and *vegna þess* belong with the *að* that follows them.
      e. After a fronted subordinate clause the main clause begins at its verb
         (V2), and words trailing a subordinate clause at the very end of the
         sentence, with no verb among them, belong to that clause: "að þið
         séuð komin [allt of seint]".
    """
    n = len(toks)
    k = [t.get('k') for t in toks]
    word = lambda i: toks[i]['w'] not in ('.', '!', '?', ',')

    def runs():
        out, a = [], 0
        for i in range(1, n + 1):
            if i == n or k[i] != k[a]:
                out.append((a, i - 1))
                a = i
        return out

    # a. infinitive after an auxiliary
    for a, b in runs():
        if k[a] != 'nafnháttarsetning' or a == 0:
            continue
        gov = next((toks[j] for j in range(a - 1, -1, -1) if toks[j]['x'] == 'so'), None)
        if toks[a]['x'] != 'nhm' or (gov is not None and gov['l'] in AUXILIARIES):
            for j in range(a, b + 1):
                k[j] = k[a - 1]
    # b. a "clause" without a verb
    for a, b in runs():
        if k[a] == 'aðalsetning' or a == 0:
            continue
        if not any(toks[j]['x'] == 'so' for j in range(a, b + 1)):
            for j in range(a, b + 1):
                k[j] = k[a - 1]
    # c. negation in front of the conjunction
    for a, b in runs():
        if a > 0 and k[a] != 'aðalsetning' and toks[a]['w'].lower() in NEGATIONS \
                and k[a - 1] == 'aðalsetning':
            k[a] = k[a - 1]
    # d. af því + að, vegna þess + að: the conjunction is all three words
    #    (orsakartenging), so the clause begins at *af* / *vegna*.
    #    v6.13 (item 28): *til þess að* likewise (tilgangstenging), where the
    #    *til* is not the main verb's own ("hlakka til þess að ..."):
    #    phrases.til_thess_opens_clause is the one place that decides it.
    for a, b in runs():
        if a >= 2 and k[a] == 'aukasetning' and toks[a]['w'].lower() == 'að' \
                and ((toks[a - 2]['w'].lower(), toks[a - 1]['w'].lower()) in CAUSAL_HEADS
                     or phrases.til_thess_opens_clause(toks, a)):
            k[a - 1] = k[a - 2] = 'aukasetning'
    # e. V2 after a fronted clause; trailing words at the end
    rr = runs()
    if len(rr) > 1 and k[0] != 'aðalsetning':
        for (a, b) in rr[1:]:
            if k[a] == 'aðalsetning':
                j = a
                while j <= b and toks[j]['x'] != 'so' and word(j):
                    k[j] = k[a - 1]
                    j += 1
                break
    rr = runs()
    if len(rr) > 1:
        a, b = rr[-1]
        if k[a] == 'aðalsetning' and a > 0 and \
                not any(toks[j]['x'] == 'so' for j in range(a, b + 1)):
            for j in range(a, b + 1):
                if word(j):
                    k[j] = k[a - 1]
    # f. A comparison is not part of the relative clause that follows it:
    #    "fljótlegri [en sú] sem við fórum". The words between the start of a
    #    subordinate run and its *sem*, with no verb among them, belong to the
    #    clause before.
    for a, b in runs():
        if k[a] != 'aukasetning' or a == 0 or toks[a]['w'].lower() != 'en':
            continue
        sem = next((j for j in range(a + 1, b + 1) if toks[j]['w'].lower() == 'sem'), None)
        if sem is not None and not any(toks[j]['x'] == 'so' for j in range(a, sem)):
            for j in range(a, sem):
                k[j] = k[a - 1]
    # g. A verbless island of main clause between two subordinate runs is a
    #    phrase the parse attached too high: "að skrifa ritgerð [um bók] sem
    #    við höfum lesið". It belongs to the clause it stands in.
    rr = runs()
    for n_, (a, b) in enumerate(rr):
        if k[a] != 'aðalsetning' or n_ == 0 or n_ == len(rr) - 1:
            continue
        if not any(toks[j]['x'] == 'so' for j in range(a, b + 1)):
            for j in range(a, b + 1):
                k[j] = k[a - 1]
    for i, t in enumerate(toks):
        t['k'] = k[i]


def clause_coordination_unsure(toks):
    """*og*, *eða* or *en* after a subordinate clause, with a verb following:
    is what follows a second half of that clause or a new main clause? "þegar
    það rignir úti [og ég er einn heima]" and "ég ætlaði að hringja [en ég
    gleymdi því]" look the same from here, and the parse settles it by where it
    happened to attach the phrase. The sentence then says nothing about its
    clause structure."""
    for i in range(1, len(toks)):
        if toks[i].get('k') == 'aðalsetning' and toks[i - 1].get('k') == 'aukasetning' \
                and toks[i]['w'].lower() in ('og', 'eða', 'en'):
            return True
    return False



def _only_adverb(b, word):
    """Does BÍN know this word form as an adverb and as nothing else?"""
    entries = b.lookup(word.lower())[1]
    return bool(entries) and all(e.ofl == 'ao' for e in entries)


def annotate(lvl, text, slot, need, opts=None):
    """One sentence, parsed, guarded and annotated — or None if it will not parse.

    This is the whole of what the build does per sentence. It is a function so
    that a candidate sentence can be tried on its own (tools/try-sentences.py)
    before it is written into sentences.py; every gap this release fills in the
    bank was found and checked that way.
    """
    g, b, guard = engines()
    s = g.parse_single(text)
    if s is None or s.tree is None:
        return None
    paths = tree_info(s.tree)
    terms = list(s.terminals)
    kinds = clause_kinds(paths, len(terms))
    toks = []
    for i, t in enumerate(terms):
        cat = CAT.get(t.category, None)
        v = set(t.variants)
        path = paths.get(i, [])
        role, also = strict_role(path, t.category, v), None
        if t.category == 'so':
            # A finite verb is the predicate of its clause, and so is the
            # supine that completes it ("hef lesið"). An infinitive or a past
            # participle is not ASKED about — whether "ætla að lesa" is one
            # predicate or two is a matter of which schoolbook is open — but
            # a child who clicks it is not told it is wrong (`ra`).
            if 'sagnb' in v:
                role = 'umsögn'
            elif 'nh' in v:
                role, also = None, ['umsögn']
            elif 'lhþt' in v:
                role, also = None, ['umsögn', 'sagnfylling']
            elif 'lh' in v:
                role = None
            else:
                role = 'umsögn'
        gov = [x for x in t.variants if x in ('þf', 'þgf', 'ef')] if t.category == 'so' else None
        mk = mark_of(t)
        # An indeclinable word class should never carry an inflection mark.
        # Greynir sometimes gives the adverb *úti* a ÞGFET, for instance; that
        # is not inflection but a consequence of how the phrase was attached.
        # The mark is dropped rather than entering the data and becoming a
        # question.
        if cat in parse_guard.UNINFLECTED:
            mk = None
        # Several words tokenised as one ("í gær", "á kvöldin", "allt of") are
        # a phrase, not a word, and a phrase has no word class to ask about.
        if ' ' in t.text and cat not in ('forsetning',):
            cat = None
        tok = {'w': t.text, 'l': t.lemma, 'c': cat, 'm': mk, 'r': role,
               'k': kinds.get(i), 'g': gov or None, 'x': t.category}
        if also:
            tok['ra'] = also
        toks.append(tok)

    # ---- 0a. declared decisions: readings that are not used ---------------
    for i, tk in enumerate(toks):
        why = parse_overrides.withdrawn(text, i, toks)
        if why:
            guard.withdraw(text, i, tk, why)

    # ---- 0. the lemma has to be a plausible reading of the form -----------
    for i, tk in enumerate(toks):
        guard.check_lemma(text, i, tk, BIN_OFL.get(tk['x'], None))

    # ---- 1. every mark must exist in BÍN -------------------------------
    for i, tk in enumerate(toks):
        ofl = BIN_OFL.get(tk['x'], None)
        guard.check_mark_exists(text, i, tk, ofl)

    # A token whose analysis was withdrawn carries no role and no government
    # either: "það rignir úti" must not offer *úti* as the subject.
    for tk in toks:
        if tk.get('rj'):
            tk['r'] = None
            tk['g'] = None
            tk.pop('ra', None)
            # ... but a verb whose analysis was withdrawn is still a verb to
            # the child looking at the sentence: clicking it as the predicate
            # is not counted wrong (*hefur* in "Hún hefur áhuga á tónlist").
            if tk['x'] == 'so':
                tk['ra'] = ['umsögn', 'sagnfylling']

    refine_roles(toks, terms, paths)

    # ---- 2. which features the surface form cannot settle ---------------
    for i, tk in enumerate(toks):
        ofl = BIN_OFL.get(tk['x'], None)
        gc = governor_case_for(toks, i) or agreeing_case(i, toks, paths, guard)
        in_poss = bool(paths.get(i)) and paths[i][-1][0] == 'NP-POSS'
        u = guard.uncertain_features(toks, i, ofl, gc, possessor=in_poss,
                                     allowed_cases=cases_allowed_here(toks, i))
        if gender_unsettled(i, toks, terms, paths, guard, ofl) and 'kyn' not in u:
            u = u + ['kyn']
        if strength_unsettled(i, toks, paths, guard, u) and 'beyging' not in u:
            u = u + ['beyging']
        u = number_from_verb(i, toks, guard, u)
        # The reflexive pronoun has one set of forms for both numbers and all
        # genders: *sig, sér, sín*. BÍN files them under the singular, and
        # "Þeir léku *sér*" was then asked as "tala: eintala". Its number is
        # whatever the subject's is, which the form does not show.
        if tk.get('l') == 'sig' and tk.get('c') == 'fornafn' and 'tala' not in u:
            u = u + ['tala']
        if u:
            tk['u'] = u

    # ---- 3. government, validated against the table ---------------------
    for i, tk in enumerate(toks):
        if tk['c'] == 'forsetning':
            pg = guard.check_preposition(text, i, toks)
            if pg:
                tk['pg'] = pg
        # A verb's case frame is not checked here any more. The parser reports
        # the frame of the entry it matched even when no object stands there
        # ("Ég veit ekki hvar …" came with a dative frame for *vita*), so a
        # disagreement with the table said nothing about the sentence. What IS
        # checked, below, is every object that actually stands in the clause:
        # confirm_objects keeps its role, and confirm_verb_government the
        # verb's government, only where the table agrees.
    confirm_objects(toks, paths)
    confirm_verb_government(toks, paths)

    # ---- 3b. words whose role is not judged ----------------------------
    # A role that was withdrawn was withdrawn because it could not be
    # VERIFIED, not because the word has none: *veðrið* in "að veðrið batni"
    # is a subject the parse mislabelled, *þetta* in "þú getur þetta" is an
    # object of a verb the table does not list. If the child clicks such a
    # word the click is not marked wrong — and not marked right either; the
    # app says the word is not judged and shows the answer it can vouch for
    # (`rn`). This is every nominal that stands outside a prepositional phrase,
    # is not a possessor, and carries no role.
    for i, tk in enumerate(toks):
        if tk.get('r') or tk['x'] not in NOMINAL:
            continue
        tags = [t for t, _ in paths.get(i, [])]
        if any(t.startswith('PP') for t in tags) or (tags and tags[-1] == 'NP-POSS'):
            continue
        # "í dag", "um morguninn", "á hverjum degi": the parse files these under
        # an adverbial phrase, not a prepositional one, but a word governed by
        # a preposition has no role of its own; nor has a genitive ("í lok dags")
        governed = False
        for j in range(i - 1, max(-1, i - 3), -1):
            if toks[j].get('c') == 'forsetning' or \
                    (toks[j]['x'] == 'fs' and ' ' not in toks[j]['w']):
                governed = True
                break
            if toks[j]['x'] not in NOMINAL:
                break
        if governed or parse_guard.case_of(tk.get('m')) == 'ef':
            continue
        tk['rn'] = 1

    # ---- 4. clause structure -------------------------------------------
    tidy_clauses(toks, paths)
    clause_unsure = bool(guard.check_clauses(text, toks)) or clause_coordination_unsure(toks)
    # A word whose class was withdrawn may have been the word that opened a
    # clause ("Ég man ekki [hvað] myndin heitir" was parsed with *hvað* as an
    # adverb and no clause at all). A sentence that has a second finite verb
    # and only one kind of clause is not described.
    finite = [t for t in toks if t['c'] == 'sagnorð' and t.get('r') == 'umsögn'
              and parse_guard.mood_of(t.get('m')) in ('FH', 'VH')]
    if len(finite) > 1 and len({t.get('k') for t in toks if t.get('k')}) == 1 \
            and not any(t['w'].lower() in ('og', 'en', 'eða') for t in toks):
        clause_unsure = True

    si = next((i for i, t in enumerate(toks) if t['l'] == slot and t['c'] == 'nafnorð'), None)
    fixed = False
    if si is not None:
        for j in (si - 1, si + 1):
            if 0 <= j < len(toks) and toks[j]['c'] in ('lýsingarorð', 'fornafn', 'greinir'):
                fixed = True

    # ---- 5. agreement: the blank's gender must not contradict the sentence -
    # "Ef ____ verður gott" with *náttúran*: the predicative *gott* is neuter
    # because the original noun was. If any other token carries the slot's
    # gender in its mark, the gender is pinned (`rk`) and only nouns of that
    # gender may stand in the blank. A coincidental match pins unnecessarily;
    # that costs variety, not correctness. A past participle predicative
    # (mark "LHÞT", no gender in it) pins too, because its gender cannot be read.
    req_kyn = None
    if si is not None and not fixed:
        # `g` is government elsewhere in this file — gender gets another name.
        slot_gender = None
        for e in b.lookup(slot)[1]:
            # the lemma itself, not another word one of whose forms it is:
            # *krakki* is also the dative of the neuter *krakk*
            if e.ofl in ('kk', 'kvk', 'hk') and e.ord == slot:
                slot_gender = e.ofl
                break
        if slot_gender:
            G = slot_gender.upper()
            for j, tk in enumerate(toks):
                if j == si or not tk.get('m'):
                    continue
                if tk['c'] not in ('lýsingarorð', 'fornafn', 'greinir', 'töluorð'):
                    continue
                parts = tk['m'].split('-')
                if G in parts:
                    req_kyn = slot_gender
                    break
            # A past participle used as a predicative agrees too, but the mark
            # the parse produces ("LHÞT") carries no gender and is therefore
            # unverified. The gender then cannot be *read*, and the blank is
            # pinned to the original noun rather than guessed at.
            # The same goes for any word of the sentence whose analysis was
            # withdrawn (*þreyttur*, *tilbúinn*, *farin*): it may agree with
            # the blank, and nothing can be read off it. Pinning costs variety;
            # "Stelpan er þreyttur" costs a child's trust.
            if req_kyn is None:
                for j, tk in enumerate(toks):
                    if j == si:
                        continue
                    if str(tk.get('m') or '').startswith('LH') or \
                            (tk.get('rj') and tk['x'] in ('so', 'lo', 'fn', 'no', 'to', 'raðnr')):
                        req_kyn = slot_gender
                        break
    # ---- 6. the slot's preposition, when it is one chosen by convention ----
    # *í búðina* but *á ströndina*: which of the two an Icelander says is a fact
    # about the noun, not about grammar. The build records the preposition the
    # slot stands under (`ps`); the app substitutes only nouns whose recorded
    # convention (noun_classes.PREP) matches it.
    slot_prep = None
    if si is not None:
        for j in range(si - 1, max(-1, si - 4), -1):
            t = toks[j]
            if t.get('c') == 'forsetning':
                lem = (t.get('l') or t.get('w') or '').lower()
                if lem in PREP_BY_CONVENTION:
                    slot_prep = lem
                break
            if t.get('c') in ('nafnorð', 'sagnorð'):
                break

    opts = opts or {}
    need_list = expand_need(need)
    if need_list is None:
        need_list = [noun_classes.klass(slot)] if slot else []
    rec = {'lvl': lvl, 't': text, 'tok': toks, 'slot': si, 'fixed': fixed,
           'need': need_list}
    if slot_prep:
        rec['ps'] = slot_prep
    # the preposition right before the slot, whatever it is
    if si is not None:
        for j in range(si - 1, max(-1, si - 4), -1):
            t = toks[j]
            if t.get('c') == 'forsetning':
                if (t.get('l') or t.get('w') or '').lower() in NO_CLOZE_UNDER:
                    rec['nf'] = True
                break
            if t.get('c') in ('nafnorð', 'sagnorð'):
                break
    if opts.get('nofill'):
        rec['nf'] = True
    if req_kyn:
        rec['rk'] = req_kyn
    if clause_unsure:
        rec['ku'] = True
    # ---- 7. kinds of subordinate clause, and phrases (item 28) -------------
    # Recorded only where the parse and a closed table agree; see phrases.py.
    # A sentence whose clause structure is not vouched for (`ku`) says
    # nothing about the kind of its clauses either.
    spans = phrases.tree_spans(s.tree)
    if not clause_unsure:
        cl = phrases.classify_clauses(toks, spans)
        if cl:
            rec['cl'] = cl
    ph = phrases.phrases(toks, spans, clause_unsure,
                         only_adverb=lambda w: _only_adverb(b, w))
    if ph:
        rec['ph'] = ph
    return rec


# Two shapes the bank must not contain, checked on every build.

# The longest a sentence at each level may be. Levels above 5 have no ceiling.
MAX_WORDS = {1: 5, 2: 7, 3: 9, 4: 11}
# The shortest a sentence at levels 6 and 7 may be, counted as words in the
# text (the parser joins "í gær" and "eins og" into one token, so tokens would
# undercount). Length is not what makes these levels harder — the
# constructions are, see sentences.py — but a short sentence cannot hold them,
# and a level-7 label on nine words would pay the þyngd-7 bonus for nothing.
MIN_WORDS = {6: 11, 7: 15}
# Below this many words a sentence is not wrong, but it is where the flashcard
# captions live, so the build says how many there are.
SHORT_AT = 4


def check_lengths(records):
    """Level ceilings and the level 6-7 floors, enforced; the short tail, reported."""
    over, short, under = [], [], []
    for r in records:
        n = sum(1 for t in r['tok'] if t['w'] != '.')
        cap = MAX_WORDS.get(r['lvl'])
        if cap is not None and n > cap:
            over.append((r['lvl'], n, cap, r['t']))
        if n < SHORT_AT:
            short.append((r['lvl'], n, r['t']))
        floor = MIN_WORDS.get(r['lvl'])
        if floor is not None and len(r['t'].split()) < floor:
            under.append((r['lvl'], len(r['t'].split()), floor, r['t']))
    if short:
        print('stuttar setningar (< %d orð):' % SHORT_AT, len(short))
    if under:
        print('OF STUTTAR SETNINGAR:', len(under))
        for lvl, n, floor, text in under:
            print(f'   þyngd {lvl}: {n} orð (lágmark {floor}) — {text!r}')
        raise SystemExit(
            'Setning á þyngd 6 eða 7 er styttri en þyngdarstigið krefst. '
            'Færðu hana niður um þyngdarstig — sjá lengdartöfluna í sentences.py.')
    if over:
        print('OF LANGAR SETNINGAR:', len(over))
        for lvl, n, cap, text in over:
            print(f'   þyngd {lvl}: {n} orð (hámark {cap}) — {text!r}')
        raise SystemExit(
            'Setning er lengri en þyngdarstigið leyfir. Færðu hana upp um '
            'þyngdarstig eða styttu hana — sjá lengdartöfluna í sentences.py.')


def check_numeral_predicative(records):
    """A blank whose predicative is a numeral can hold exactly one word.

    *Klukkan er þrjú*: the numeral fixes the number of the subject, and the
    slot's own mark fixes it too, so every substitution contradicts one or the
    other. An adjective predicative is fine — it agrees, and section 5 reads
    the agreement out of the parse. A check rather than a filter: there is no
    way to write such a sentence well, so the build stops.
    """
    bad = []
    for r in records:
        si = r.get('slot')
        if si is None or r.get('fixed'):
            continue
        if r['tok'][si].get('r') != 'frumlag':
            continue
        for j, t in enumerate(r['tok']):
            if j != si and t.get('r') == 'sagnfylling' and t.get('c') == 'töluorð':
                bad.append((r['t'], t['w']))
                break
    if bad:
        print('SAGNFYLLING ER TÖLUORÐ:', len(bad))
        for text, w in bad:
            print(f'   {text!r} — {w!r} bindur töluna, svo eyðan tekur aðeins eitt orð.')
        raise SystemExit(
            'Setning þar sem sagnfyllingin er töluorð getur ekki haft eyðu. '
            'Fjarlægðu hana eða gerðu töluorðið að hluta nafnliðarins.')


def main():
    """The build: every sentence in sentences.py, annotated and written out."""
    g, b, guard = engines()
    # The manifest (tools/manifest.mjs) is keyed on a sentence's *text*, so two
    # sentences with the same text mean only one of them is ever fingerprinted — the
    # other can change its analysis with nothing to report it. v5.2 had one such case
    # ("Bókin liggur á borðinu." twice, with different blanks) and it had gone
    # unnoticed. That is a silent failure of exactly the kind v5.2 was written to
    # rule out, so it gets the same treatment: the build stops.
    _seen_text = {}
    for _lvl, _text, _slot, _need, *_ in sentences.S:
        if _text in _seen_text:
            raise SystemExit(
                'Sama setningin tvisvar í sentences.py: %r (eyður: %s og %s).\n'
                'Handfestan er lykluð eftir texta, svo afrit fela breytingar. '
                'Breyttu textanum eða fjarlægðu aðra færsluna.'
                % (_text, _seen_text[_text], _slot))
        _seen_text[_text] = _slot

    out, failed = [], []
    for lvl, text, slot, need, *rest in sentences.S:
        rec = annotate(lvl, text, slot, need, rest[0] if rest else None)
        if rec is None:
            failed.append(text)
            continue
        out.append(rec)

    if failed:
        print('PARSE FAILURES:', len(failed))
        for f in failed:
            print('  FAIL:', f)
        raise SystemExit('Setning sem þáttast ekki má ekki fara inn í gögnin.')

    check_lengths(out)
    check_numeral_predicative(out)

    if guard.relemma:
        print('ÓLÍKLEG LEMMA — greining tekin úr umferð:', len(guard.relemma))
        for (s_, i_, w_, l_, m_, why) in guard.relemma:
            print(f'   {w_!r} -> {l_!r} ({m_}) í {s_[:60]!r}: {why}')
    guard.check_overrides_all_used()
    stale = parse_overrides.unused_vetoes()
    if stale:
        print('ÓNOTAÐAR ÁKVARÐANIR í parse_overrides.py:', len(stale))
        for k in stale:
            print('   ', k)
        raise SystemExit('Færsla í CLASS_VETO/TOKEN_VETO á ekki lengur við neitt tákn. '
                         'Fjarlægðu hana — annars gæti hún hulið nýja villu síðar.')
    if guard.withdrawn:
        print('greining tekin úr umferð með yfirlýstri ákvörðun (orðflokkur):', len(guard.withdrawn))
        for (s_, i_, w_, c_, m_, why) in guard.withdrawn:
            print(f'   {w_!r} ({c_}) í {s_[:50]!r}: {why}')
    guard.raise_if_hard()

    rep = guard.report()
    print('parsed', len(out), 'failed', len(failed))
    if guard.rejected:
        print('greiningar teknar úr umferð með yfirlýstri ákvörðun:', len(guard.rejected))
        for (s_, i_, w_, m_, _why) in guard.rejected:
            print(f'   {w_!r} ({m_}) í {s_[:56]!r}')
    print('vörður: harðar villur', rep['hard'], '| merkingar', rep['soft'] or '{}')

    amb = sum(1 for o in out for t in o['tok'] if t.get('u'))
    print('tákn með óvissan þátt:', amb, '— um þau er aldrei spurt')
    for o in out:
        for i, t in enumerate(o['tok']):
            if t.get('u'):
                print(f"   {t['w']:<14} {t['m'] or '':<18} óvíst: {','.join(t['u'])}   [{o['t'][:52]}]")

    noslot = [o['t'] for o in out if o['slot'] is None]
    named = sum(1 for (_l, _t, _s, *_r) in sentences.S if _s)
    print('no slot found: %d (of which %d name a slot)' % (
        len(noslot), named - sum(1 for o in out if o['slot'] is not None)))
    for (lvl, text, slot, *_r), o in zip(sentences.S, out):
        if slot and o['slot'] is None:
            print('   SLOT NOT FOUND:', repr(slot), 'in', repr(text))
    print('eyður sem eru ekki spurðar sem eyðufylling (nf):',
          sum(1 for o in out if o.get('nf')))

    # A slot under í or á is not a template — section 6. Printed so the number
    # is visible on every build rather than only when somebody goes looking.
    prep_slots = [o for o in out if o.get('ps')]
    print('eyður undir forsetningu (ekki skipt út):', len(prep_slots))

    json.dump(out, open('sentences.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'sentences': len(out), 'uncertain_tokens': amb, 'guard': rep,
               'prep_slots': len(prep_slots),
               'clause_unsure': sum(1 for o in out if o.get('ku'))},
              open('data/parse_report.json', 'w'), ensure_ascii=False, indent=1)
    import os
    print('sentences.json %.0f KB' % (os.path.getsize('sentences.json') / 1024))



if __name__ == '__main__':
    main()