# -*- coding: utf-8 -*-
"""Generate the app lexicon straight out of BÍN. No hand entry, no CSV."""
from islenska import Bin
import json, collections, os, vocab_filter as vf, adj_classes
b=Bin()
freq=json.load(open('data/freq_lemmas.json'))
# [lemma, class, corpus score, rank key]; the file is in rank-key order (build_freq.py)
rows=[(int(bid),o,c,s) for bid,(o,c,s,_k) in freq.items()]

CASES=['NF','ÞF','ÞGF','EF']
# Slot order for a noun paradigm: singular then plural, indefinite then
# definite, four cases inside each. It has to match ORDERS['no'] in the bundle
# exactly, because the app splits the stored form string on ';' and reads the
# cells positionally. (Two earlier drafts of this line were left in the file
# until v5.6 and simply overwritten each other.)
NO_ORDER=[f'{c}{n}{g}' for n in ['ET','FT'] for g in ['','gr'] for c in CASES]
DEG=['FSB','FVB','MST','ESB','EVB']
LO_ORDER=[f'{d}-{k}-{c}{n}' for d in DEG for k in ['KK','KVK','HK'] for n in ['ET','FT'] for c in CASES]
FN_ORDER=[f'{k}-{c}{n}' for k in ['KK','KVK','HK'] for n in ['ET','FT'] for c in CASES]
PFN_ORDER=[f'{c}{n}' for n in ['ET','FT'] for c in CASES]
SO_ORDER=([f'{v}-{m}-{t}-{p}P-{n}' for v in ['GM','MM'] for m in ['FH','VH']
           for t in ['NT','ÞT'] for p in [1,2,3] for n in ['ET','FT']]
          + ['GM-NH','MM-NH','GM-SAGNB','MM-SAGNB','LHNT','GM-BH-ET','GM-BH-FT','GM-BH-ST',
             'LHÞT-SB-KK-NFET','LHÞT-SB-KVK-NFET','LHÞT-SB-HK-NFET'])
ORDERS={'no':NO_ORDER,'lo':LO_ORDER,'fn':FN_ORDER,'pfn':PFN_ORDER,'so':SO_ORDER}
ORDER_OF={'kk':'no','kvk':'no','hk':'no','lo':'lo','so':'so'}

def paradigm(bin_id, order):
    """All BÍN-core forms for one lemma, in a fixed slot order; '|' separates
    genuine variants (two correct answers), '' means the slot does not exist."""
    # What is kept, and why (BÍN's KRISTÍNarsnið fields):
    #   birting == 'K'   the core vocabulary
    #   einkunn == 1     the lemma is standard Icelandic
    #   beinkunn == 1    the FORM is standard (0 = wrong, 2-4 = rare variants)
    #   malsnid/bmalsnid empty   no register note (slang, obsolete, dialect)
    # `malfraedi` is NOT a reason to drop a lemma: it is a note that a spelling
    # or declension variant exists (STAFS, EBEYG, KYN, TALA, OSB …) and it sits
    # on words like *köttur*, *hönd*, *sól*, *jörð* and *líf*. Filtering on it
    # removed 203 of the commonest words in the language from v5.9.
    # Before v6 the grade test was `(x or 1) <= 1`, which turned a grade of 0
    # (incorrect) into 1 and let *stóli*, *nóttu* and *friðs* in as answers.
    ent=[e for e in b.lookup_id(bin_id) if e.birting=='K' and e.einkunn==1
         and e.beinkunn==1 and not e.malsnid and not e.bmalsnid]
    # `lookup_id` promises no order. Sorting on the mark makes the build
    # reproducible across Python versions and puts BÍN's primary variant first
    # ("NFFT" before "NFFT2"); the first variant is the one shown as "rétt er".
    ent.sort(key=lambda e: (e.mark, e.bmynd))
    slots=collections.defaultdict(list)
    for e in ent:
        base=e.mark
        # variant numbering (EFFT2) marks an equally valid alternative form
        for o in order:
            if base==o or (base.startswith(o) and base[len(o):].isdigit()):
                if e.bmynd not in slots[o]: slots[o].append(e.bmynd)
    return [ '|'.join(slots[o]) for o in order ]

def take(ofl, n, order_key, need=None):
    """n=None: everything the corpus attests and BÍN confirms."""
    out=[]
    for bid,o,c,s in rows:
        if c!=ofl or (n is not None and len(out)>=n): continue
        if not vf.keep(o,c): continue
        if not (o.isalpha() and o==o.lower()): continue
        if ofl in ('kk','kvk','hk','lo','so') and len(o)<3: continue
        f=paradigm(bid, ORDERS[order_key])
        if need is not None and sum(1 for x in f[:need] if x)<need: continue
        if not any(f): continue
        out.append({'i':bid,'o':o,'c':c,'r':len(out)+1,'f':';'.join(f)})
    return out

# What limits the vocabulary: a lemma has to be attested by the frequency
# list (freq_lemmas.json), and every singular case (nouns, adjectives) or the
# first six verb forms have to exist in the BÍN core, so no question can be
# asked that has no correct answer. The frequency rank `r` steers selection
# in the app (common words come up many times more often).
W=[]
for g in ['kk','kvk','hk']:
    W += take(g,None,'no',need=4)         # must at least have the four singular cases
W += take('lo',None,'lo',need=4)
W += take('so',None,'so',need=6)
# closed classes: take BÍN's whole inventory rather than a frequency cut
for ofl,order in [('fn','fn'),('pfn','pfn'),('afn','pfn'),('abfn','pfn'),
                  ('gr','fn'),('to','fn'),('rt','fn')]:
    W += take(ofl,None,order)
# closed classes are small and finite: make sure the ones a curriculum needs are
# present even if the subtitle corpus happens to rank them low
MUST=[('ég','pfn'),('þú','pfn'),('hann','pfn'),('hún','pfn'),('það','pfn'),('sig','afn'),
      ('sá','fn'),('þessi','fn'),('hinn','gr'),('minn','fn'),('þinn','fn'),('sinn','fn'),
      ('hver','fn'),('hvaða','fn'),('allur','fn'),('enginn','fn'),('einhver','fn'),
      ('annar','rt'),('einn','fn'),('sjálfur','fn')]
have={(x['o'],x['c']) for x in W}
for lemma,ofl in MUST:
    if (lemma,ofl) in have: continue
    _,ms=b.lookup_lemmas(lemma)
    ids=sorted({m.bin_id for m in ms if m.ofl==ofl})
    if not ids: print('  vantar:',lemma,ofl); continue
    key={'pfn':'pfn','afn':'pfn','abfn':'pfn'}.get(ofl,'lo' if ofl in ('lo','rt') else 'fn')
    f=paradigm(ids[0],ORDERS[key])
    if any(f): W.append({'i':ids[0],'o':lemma,'c':ofl,'r':99,'f':';'.join(f)})
# Every noun the sentence bank blanks out has to be in the vocabulary, or the
# cloze cannot show the sentence with its own noun. The subtitle corpus has no
# *nesti*, *kaffi* or *mínúta*; BÍN has them. They get a middling rank.
import sentences as _sentences
have={(x['o'],x['c']) for x in W}
for _lvl,_text,_slot,*_rest in _sentences.S:
    if not _slot or any((_slot,g) in have for g in ('kk','kvk','hk')): continue
    _,ms=b.lookup_lemmas(_slot)
    ids=sorted({(m.ofl,m.bin_id) for m in ms if m.ofl in ('kk','kvk','hk')})
    for ofl,bid in ids[:1]:
        f=paradigm(bid,ORDERS['no'])
        if sum(1 for x in f[:4] if x)<4: continue
        W.append({'i':bid,'o':_slot,'c':ofl,'r':300,'f':';'.join(f)})
        have.add((_slot,ofl))
        print('  added for the sentence bank:',_slot,ofl)
# A word allowed into a frame by content/setningar/lino-rammar.tsv (issue #20,
# frame_allow.py) has to be in the vocabulary too, for the same reason. Most
# are; one the subtitle list never saw comes out of BÍN's core here, so the
# file works with or without LÍNO-2 in the build. A word BÍN's core does not
# have as a noun with its four singular cases stops the build, with the line.
import lino as _lino, frame_allow as _frame_allow
have={(x['o'],x['c']) for x in W}
for _r in _frame_allow.read(_sentences.S):
    _g=[_r['gender']] if _r['gender'] else ['kk','kvk','hk']
    if any((_r['lemma'],g) in have for g in _g): continue
    _why='er ekki nafnorð í kjarna BÍN / is not a noun in BÍN\'s core'
    for ofl,bid in sorted({(m.ofl,m.bin_id) for m in _lino.core(b,_r['lemma']) if m.ofl in _g}):
        if not vf.keep(_r['lemma'],ofl):
            _why='er síað úr orðaforðanum (vocab_filter.py) / is filtered out of the vocabulary'; continue
        f=paradigm(bid,ORDERS['no'])
        if sum(1 for x in f[:4] if x)<4:
            _why='hefur ekki öll fjögur föll eintölu í BÍN / lacks a singular case in BÍN'; continue
        W.append({'i':bid,'o':_r['lemma'],'c':ofl,'r':300,'f':';'.join(f)})
        have.add((_r['lemma'],ofl))
        print('  added for a frame pair:',_r['lemma'],ofl)
        break
    else:
        raise SystemExit('%s:%d: „%s“ %s' % (_r.file,_r.line,_r['lemma'],_why))
# indeclinables: one form each
for ofl in ['fs','st','ao','uh','nhm']:
    got=0
    for bid,o,c,s in rows:
        if c!=ofl: continue
        if not vf.keep(o,c): continue
        W.append({'i':bid,'o':o,'c':c,'r':got+1,'f':o}); got+=1

# LÍNO-2, the academic word list (lino.py, issue #9). A word on it that the
# subtitle list never saw (*forsenda* is not film dialogue) comes in the way the
# sentence bank's nouns do: out of BÍN's core, if BÍN has every form a question
# needs, at the same middling rank. The first BÍN class that qualifies is
# taken (one reading per entry; the homograph pass below adds the others).
import lino
LINO_WORDS=lino.load()
LINO_ADDABLE=('kk','kvk','hk','lo','so','ao')
_lino_added=[]; _lino_out=[]
have={(x['o'],x['c']) for x in W}
for lemma,cls,rank in LINO_WORDS:
    cand=[c for c in LINO_ADDABLE if cls is None or c in cls]
    if not cand:     # a closed class: BÍN's inventory is in already, or it is not taught
        if not any((lemma,c) in have for c in cls): _lino_out.append((rank,lemma,'class not taught'))
        continue
    if any((lemma,c) in have for c in cand): continue
    ids=sorted({(m.ofl,m.bin_id) for m in lino.core(b,lemma) if m.ofl in cand})
    why='not in BÍN' if not ids else 'not all forms in BÍN'
    for ofl,bid in ids:
        if not vf.keep(lemma,ofl): why='vocab_filter'; continue
        if ofl=='ao':
            W.append({'i':bid,'o':lemma,'c':ofl,'r':300,'f':lemma})
        else:
            f=paradigm(bid,ORDERS[ORDER_OF[ofl]])
            need=6 if ofl=='so' else 4
            if sum(1 for x in f[:need] if x)<need: continue
            W.append({'i':bid,'o':lemma,'c':ofl,'r':300,'f':';'.join(f)})
        have.add((lemma,ofl)); _lino_added.append(f'{lemma}·{ofl}'); break
    else:
        _lino_out.append((rank,lemma,why))
print('LÍNO-2: %d words added that the subtitle list does not have:' % len(_lino_added),
      ' '.join(_lino_added[:20]) + (' …' if len(_lino_added)>20 else ''))

# Two verbs, one infinitive. BÍN has *brenna* (brann) and *brenna* (brenndi),
# and likewise *sleppa*, *skella*, *sökkva*, *smella*: a strong intransitive
# verb and the weak transitive made from it. Both came in as separate entries
# under the same name, and "ég ___ (að brenna, þátíð)" then accepted *brann*
# or *brenndi* according to which of the two the dice had picked. They are one
# entry now, with both verbs' forms in every cell; either answer is right,
# because nothing in a bare conjugation question says which verb is meant.
_seen={}
_merged=[]
for x in W:
    k=(x['o'],x['c'])
    if k not in _seen:
        _seen[k]=x; continue
    first=_seen[k]
    a,bb=first['f'].split(';'),x['f'].split(';')
    cells=[]
    for ca,cb in zip(a,bb):
        v=[y for y in ca.split('|') if y]
        for y in cb.split('|'):
            if y and y not in v: v.append(y)
        cells.append('|'.join(v))
    first['f']=';'.join(cells)
    x['_drop']=True
    _merged.append(x['o'])
W=[x for x in W if not x.get('_drop')]
if _merged: print('  merged same-name entries:',' '.join(sorted(set(_merged))))

# The middle voice. BÍN gives nearly every verb a full set of -st forms,
# mechanically: *hlakkast*, *slátrast*, *pissast*. A child asked for "við
# ___ (að hlakka, miðmynd)" is being asked for a word nobody has said. A verb
# is therefore drilled in the middle voice only if the corpus attests it: some
# -st form of the verb that belongs to no other word occurs at least three
# times in the frequency list (`mm`). That keeps *hittast*, *kyssast*,
# *gerast*, *komast*, *klæðast* — about 280 verbs — and drops the rest. The
# forms stay in the paradigm; they are only not asked for.
from build_freq import form_counts
_counts=form_counts()
_so=ORDERS['so']
MM_MIN=3
_n_mm=0
for x in W:
    if x['c']!='so': continue
    cells=dict(zip(_so,x['f'].split(';')))
    forms={y for m,c in cells.items() if m.startswith('MM') for y in c.split('|') if y}
    tot=0
    for y in sorted(forms):
        n=_counts.get(y,0)
        if not n: continue
        _,ms=b.lookup(y)
        if ms and all(m.bin_id==x['i'] for m in ms): tot+=n
    if tot>=MM_MIN:
        x['mm']=1; _n_mm+=1
print('  verbs with an attested middle voice:',_n_mm)

# Verbs that are said of the weather, or have no subject in the nominative
# (*það snjóar*, *mér batnar*, *látunum linnir*). BÍN lists "ég snjóa, þú
# snjóar" all the same. The conjugation drill asks these only in the third
# person singular, with *það*, and never as a six-cell table (`t3`). A short
# hand list, because nothing in BÍN's core marks it: only verbs where the
# first and second person are not Icelandic anyone uses.
THIRD_PERSON_ONLY=set('''
snjóa rigna hlýna kólna dimma hitna batna versna skána linna skeika blæða
svíða gjósa geisa ryðga braka ólga hvarfla vofa ægja þrjóta harðna kvikna
slokkna flæða gilda nægja
'''.split())
for x in W:
    if x['c']=='so' and x['o'] in THIRD_PERSON_ONLY: x['t3']=1
print('  third-person-only verbs:',' '.join(x['o'] for x in W if x.get('t3')))

# Homographs: once a lemma is in, its other readings in BÍN come in too (*ljós*
# the noun and the adjective), with a rank penalty. Two filters keep look-up
# rubbish out, neither a word list: (1) a noun<->verb pair is systematic
# homography — the infinitive in -a coincides with the weak feminine declension,
# so BÍN has an entry for nearly every pair — and the unattested side is
# skipped; (2) an addition at least half of whose forms the attested reading
# already has (*hvítur* as a noun) teaches nothing and is skipped.
EXTRA_SKIP_NOUN_VERB=True     # filter 1
EXTRA_MIN_NEW_FORMS=0.5       # filter 2
NOUNS={'kk','kvk','hk'}

def _forms_of(fstr):
    out=set()
    for cell in str(fstr).split(';'):
        for v in cell.split('|'):
            if v: out.add(v.lower())
    return out
TEACHABLE={'kk','kvk','hk','lo','so'}
have={(x['o'],x['c']) for x in W}
skipped=[]
rank_of={}
for x in W: rank_of.setdefault(x['o'], x['r'])
extra=[]
for lemma in sorted({x['o'] for x in W if x['c'] in TEACHABLE}):
    _,ms=b.lookup_lemmas(lemma)
    for ofl in sorted({m.ofl for m in ms} & TEACHABLE):
        if (lemma,ofl) in have: continue
        if not vf.keep(lemma,ofl): continue
        ids=sorted({m.bin_id for m in ms if m.ofl==ofl})
        if not ids: continue
        cur={x['c'] for x in W if x['o']==lemma}
        if EXTRA_SKIP_NOUN_VERB and (
                (ofl=='so' and (cur & NOUNS)) or (ofl in NOUNS and 'so' in cur)):
            skipped.append(f"{lemma}·{ofl}"); continue
        f=paradigm(ids[0], ORDERS[ORDER_OF[ofl]])
        need=6 if ofl=='so' else 4
        if sum(1 for x in f[:need] if x)<need: continue
        mine=_forms_of(';'.join(f))
        others=set()
        for x in W:
            if x['o']==lemma and x['c']!=ofl: others|=_forms_of(x['f'])
        if mine and len(mine-others)/len(mine) < EXTRA_MIN_NEW_FORMS:
            skipped.append(f"{lemma}·{ofl}(duplicate)"); continue
        extra.append({'i':ids[0],'o':lemma,'c':ofl,'r':rank_of.get(lemma,300)+200,
                      'f':';'.join(f)})
        have.add((lemma,ofl))
W+=extra
print('homograph additions:',len(extra),
      [f"{x['o']}·{x['c']}" for x in extra[:12]])
print('  rejected by filters 1-2:',len(skipped),skipped[:10])

# Comparison. BÍN lists a miðstig and an efsta stig for nearly every adjective,
# mechanically: *velkomnari*, *dauðastur*, *breskari*, *óléttust*. The ones
# nobody uses (adj_classes.NO_COMPARE — the rule is at the top of that file)
# are taken out of the paradigm here, at the source, so that no table,
# analysis question, cloze or review can show one: a cell that is empty is a
# cell the app does not have. The positive degree is untouched.
_lo=ORDERS['lo']
_stripped=[]
for x in W:
    if x['c']!='lo' or adj_classes.compares(x['o']): continue
    cells=x['f'].split(';')
    kept=[('' if m[:3] in ('MST','ESB','EVB') else c) for m,c in zip(_lo,cells)]
    if kept!=cells:
        x['f']=';'.join(kept); _stripped.append(x['o'])
print('  adjectives shown in the positive degree only:',len(_stripped))

# Every word on LÍNO-2 carries its LÍNO rank, `lino` (1 = the commonest on the
# list); the app knows it as an academic word by that field alone. Only the
# class(es) the list gives; with no class column, every class (lino.tag).
_n=lino.tag(W,LINO_WORDS)
_in={x['o'] for x in W if x.get('lino')}
_lino_out=[t for t in _lino_out if t[1] not in _in]
print('LÍNO-2: %d lexicon words carry a LÍNO rank; %d entries are not in the lexicon%s'
      % (_n, len(_lino_out), ':' if _lino_out else ''))
for r,o,why in sorted(_lino_out): print('    %4d  %s (%s)' % (r,o,why))

# The second axis of difficulty (v6.13, critique item 16): how irregular each
# paradigm is (`irr`, 1-5) and how hard each cell is (`cellh`, one digit per
# cell in the order of ORDERS). Measured here, on the finished paradigms —
# after the same-name merge, so *brenna* is scored with both its pasts — and
# explained in irregularity.py. These two fields are the ONLY place the
# scores are kept; the app reads them and nothing else (core/lexicon.js).
import irregularity
_irr=collections.defaultdict(collections.Counter)
_why=collections.Counter()
for x in W:
    sc=irregularity.score(x,ORDERS)
    if sc is None: continue
    x['irr']=sc[0]
    _irr['no' if x['c'] in NOUNS else x['c']][sc[0]]+=1
    for fl in sc[1]: _why[fl]+=1
for k in ('no','lo','so'):
    print('  irregularity %s:'%k,' '.join('%d:%d'%(n,_irr[k][n]) for n in range(1,6)))
print('  irregularity flags:',' '.join('%s:%d'%kv for kv in sorted(_why.items())))
for n in range(1,6):
    print('  irr %d:'%n,' '.join(x['o'] for x in W if x.get('irr')==n)[:110])

data={'v':5,'src':'BÍN via BinPackage; tíðni úr OpenSubtitles-lista','orders':ORDERS,
      'cellh':irregularity.cell_table(ORDERS),'w':W}
json.dump(data,open('data/lexicon.json','w'),ensure_ascii=False,separators=(',',':'))
cnt=collections.Counter(x['c'] for x in W)
print('words:',len(W),dict(cnt))
print('data/lexicon.json %.0f KB'%(os.path.getsize('data/lexicon.json')/1024))
for c in ['kk','lo','so','fn','pfn','to','gr','fs','st','ao','uh','nhm']:
    ex=[x['o'] for x in W if x['c']==c][:8]; print(f'{c:4}',' '.join(ex))
