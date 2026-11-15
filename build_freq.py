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
    # fixed ordering: ties break on bin_id so the build is reproducible
    rank=sorted(keep, key=lambda x:(-score[x], x))
    json.dump({str(k):[meta[k][0],meta[k][1],round(score[k])] for k in rank},
              open('freq_lemmas.json','w'), ensure_ascii=False)
    by=collections.defaultdict(list)
    for bid in rank: by[meta[bid][1]].append(meta[bid][0])
    print('lemmas kept:',len(rank))
    for ofl in ['kk','kvk','hk','lo','so','fn','pfn','to','fs','st','ao','uh']:
        if by[ofl]: print(f'{ofl:4}{len(by[ofl]):6}  {" ".join(by[ofl][:16])}')
