from islenska import Bin
import collections, json
b=Bin()
FIX={'đ':'ð','ķ':'ó','ū':'þ','ũ':'ý','õ':'ð','ō':'ð','ô':'ð','ā':'á','ä':'á','ą':'í'}
ALT={'ķ':['ó','í','æ'],'ą':['í','á','ö'],'ā':['á','ó'],'ä':['á','ó'],'ũ':['ý','ú']}
def repair(w):
    if not any(c in FIX for c in w): return w
    g="".join(FIX.get(c,c) for c in w)
    if b.contains(g): return g
    bad=[c for c in set(w) if c in ALT]
    if len(bad)==1:
        for cand in ALT[bad[0]]:
            t="".join(cand if c==bad[0] else FIX.get(c,c) for c in w)
            if b.contains(t): return t
    return g

def form_counts(path='freq_raw.txt'):
    """Repaired surface form -> occurrences. Used by build_lexicon.py to see
    which middle-voice forms the corpus attests."""
    out=collections.Counter()
    for line in open(path,encoding='utf-8'):
        p=line.split()
        if len(p)==2: out[repair(p[0])]+=int(p[1])
    return out

# ---------------------------------------------------------------------------
# From subtitle frequency to a teaching rank (v6.13, critique item 9).
#
# The corpus is OpenSubtitles: dubbed films. Its order is the order of film
# dialogue — *herra* the 3rd commonest noun, *byssa* the 38th, *hátign*,
# *ofursti* and *liðþjálfi* in the top 300 — and the app served words in that
# order. No better frequency list is available offline, so the rank is the
# subtitle score corrected by two signals that are, both deterministic and
# both in the repository:
#
#   SCHOOL_FACTOR    × 3 for a word the hand-written school material uses: the
#                    sentence bank (sentences.py), the exercises (exercises.py)
#                    and the definitions written for children (definitions.py).
#                    They are what a pupil of 13–15 reads in this app's own
#                    Icelandic. A form that BÍN gives several lemmas counts for
#                    the one the corpus scores highest: *veit* lifts *vita* and
#                    not *veita*, *við* the pronoun and not *viður*.
#   SUBTITLE_FACTOR  × 0.1 for film register: the words in
#                    vocab_filter.SUBTITLE_REGISTER (address, film ranks, guns,
#                    mild oaths …), and any word that Íslensk nútímamálsorðabók
#                    labels *niðrandi* or *gróft* in every sense it has.
#
# The key is score × factors, for content words and adverbs only (closed
# classes are taken whole, and their order is BÍN's inventory). Nothing is
# added or removed here: the same words, in a different order.
SCHOOL_FACTOR=3
RERANK={'kk','kvk','hk','lo','so','ao'}
INO_XML='islensk_nutimamalsordabok_2026-02.xml'
INO_COARSE=('niðrandi','gróft')

def school_lemmas(best):
    """(lemma, class) pairs the hand-written school material attests.
    `best`: (lemma, class) -> corpus score, to read an ambiguous form."""
    import re, sentences, exercises, definitions
    def strings(o,out):
        if isinstance(o,str): out.append(o)
        elif isinstance(o,dict):
            for k,v in o.items(): strings(k,out); strings(v,out)
        elif isinstance(o,(list,tuple,set,frozenset)):
            for v in o: strings(v,out)
    txt=[]
    for m in (sentences,exercises,definitions):
        for k,v in sorted(vars(m).items()):
            if k.startswith('_') or callable(v) or hasattr(v,'__file__'): continue
            strings(v,txt)
    out=set()
    for t in sorted({t for x in txt for t in re.findall('[a-záðéíóúýþæö]+',x.lower())}):
        _,ms=b.lookup_ksnid(t)
        ids=sorted({(m.ord,m.ofl) for m in ms if m.hluti=='alm' and m.birting=='K'})
        if ids: out.add(max(ids, key=lambda x: best.get(x,0)))   # ties: first in sorted order
    return out

def ino_coarse():
    """(lemma, class) pairs that ÍNO labels niðrandi or gróft in EVERY sense.
    One unlabelled sense (or a second, unlabelled entry of the same name and
    class) and the word is not counted: *drulla* the verb has a plain sense."""
    import xml.etree.ElementTree as ET, os
    if not os.path.exists(INO_XML):
        raise SystemExit(f'build_freq.py: {INO_XML} is missing; the rank depends on it')
    POS={'noun':'no','verb':'so','adjective':'lo','adverb':'ao'}
    G={'m':'kk','f':'kvk','n':'hk'}
    seen=collections.defaultdict(list)
    for _,e in ET.iterparse(INO_XML):
        if e.tag!='LexicalEntry': continue
        pos=next((f.get('val') for f in e.findall('feat') if f.get('att')=='partOfSpeech'),None)
        lem=e.find('Lemma/feat')
        g=None
        wf=e.find('WordForm')
        if wf is not None:
            g=next((f.get('val') for f in wf.findall('feat') if f.get('att')=='grammaticalGender'),None)
        c=POS.get(pos)
        if c=='no': c=G.get(g)
        senses=e.findall('Sense')
        if lem is not None and c and senses:
            seen[(lem.get('val'),c)].append(all(
                any(lab in (t.text or '') for t in s.findall('ContextualUsage/text') for lab in INO_COARSE)
                for s in senses))
        e.clear()
    return {k for k,v in seen.items() if all(v)}

def rank_key(score, meta):
    """bin_id -> the score the vocabulary is ordered by. See above."""
    import vocab_filter as vf
    best={}
    for bid,(o,c) in meta.items(): best[(o,c)]=max(best.get((o,c),0),score[bid])
    school=school_lemmas(best)
    coarse=ino_coarse()
    key={}
    for bid,(o,c) in meta.items():
        k=score[bid]
        if c in RERANK:
            if (o,c) in school: k*=SCHOOL_FACTOR
            if o in vf.SUBTITLE_REGISTER or (o,c) in coarse: k*=vf.SUBTITLE_FACTOR
        key[bid]=k
    lex={(o,c) for o,c in meta.values() if c in RERANK}
    low=sorted(p for p in lex if p[0] in vf.SUBTITLE_REGISTER or p in coarse)
    print('rank: %d words lifted (school material), %d lowered (film register; %d of them by ÍNO label)'
          % (len(lex & school), len(low), len(lex & coarse)))
    print('  lowered by ÍNO label:', ' '.join(sorted(o for o,c in lex & coarse)))
    return key

if __name__=='__main__':
    uniq=collections.Counter(); share=collections.Counter()
    forms=collections.defaultdict(set); meta={}
    for line in open('freq_raw.txt',encoding='utf-8'):
        p=line.split()
        if len(p)!=2: continue
        w,c=repair(p[0]),int(p[1])
        if not w.isalpha(): continue
        _,ms=b.lookup_ksnid(w)
        ms=[m for m in ms if m.hluti=='alm' and m.birting=='K' and m.bin_id]
        ids={(m.bin_id,m.ord,m.ofl) for m in ms}
        if not ids: continue
        for bid,ord_,ofl in ids:
            meta[bid]=(ord_,ofl); forms[bid].add(w); share[bid]+=c/len(ids)
            if len(ids)==1: uniq[bid]+=c          # this form can only be this lemma
    # A lemma's score is what only it can account for, plus a part of what it
    # shares with other words. The shared part is capped at three times the
    # unique part (v6.5): without the cap *viður* was the fourth commonest
    # noun in the language (every *við*), *bar* the 23rd (*bara*), *hani* the
    # 42nd (*hana*), and the drills asked for them accordingly.
    # Content words only: a preposition or a conjunction shares nearly every
    # form it has (*á*, *að*, *er*) and is not ranked by this at all.
    CAPPED={'kk','kvk','hk','lo','so'}
    score={bid: uniq[bid] + (min(0.3*share[bid], 3*uniq[bid]) if meta[bid][1] in CAPPED
                             else 0.3*share[bid]) for bid in meta}
    CONTENT=CAPPED
    keep=[bid for bid in meta if (meta[bid][1] not in CONTENT)
          or (uniq[bid] > 0 and len(forms[bid]) >= 2)]
    key=rank_key(score, meta)
    # fixed ordering: ties break on bin_id so the build is reproducible
    rank=sorted(keep, key=lambda x:(-key[x], x))
    # [lemma, class, corpus score, rank key]. The corpus score is what it
    # always was: the parse guard (build_sentences.py) weighs readings by it
    # and core/rarity.js turns it into a rarity tier, and neither should move
    # because a word was ranked down for teaching. The ORDER of the file, and
    # so the rank `r` every word gets in build_lexicon.py, follows the key.
    json.dump({str(k):[meta[k][0],meta[k][1],round(score[k]),round(key[k],1)] for k in rank},
              open('freq_lemmas.json','w'), ensure_ascii=False)
    by=collections.defaultdict(list)
    for bid in rank: by[meta[bid][1]].append(meta[bid][0])
    print('lemmas kept:',len(rank))
    for ofl in ['kk','kvk','hk','lo','so','fn','pfn','to','fs','st','ao','uh']:
        if by[ofl]: print(f'{ofl:4}{len(by[ofl]):6}  {" ".join(by[ofl][:16])}')
