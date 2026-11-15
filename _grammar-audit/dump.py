# One line per sentence: word/class.mark~uncertain=role>government, with clause changes.
import json,sys
d=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'sentences.json'))
C={'nafnorð':'no','sagnorð':'so','fornafn':'fn','forsetning':'fs','atviksorð':'ao','lýsingarorð':'lo','samtenging':'st','töluorð':'to','nafnháttarmerki':'nhm',None:'-'}
R={'frumlag':'F','umsögn':'U','andlag':'A','sagnfylling':'SF','óbeint andlag':'ÓA'}
K={'aðalsetning':'AÐ','aukasetning':'AUK','nafnháttarsetning':'NH'}
for i,s in enumerate(d):
    out=[];k=None
    for j,t in enumerate(s['tok']):
        if t['x']=='' and t['c'] is None and not t['w'][0].isalpha(): continue
        if t['k']!=k:
            k=t['k']; out.append('['+K.get(k,str(k))+']')
        a=t['w']
        if j==s['slot']: a='«'+a+'»'
        a+='/'+C.get(t['c'],t['c'])
        if t['l'].lower()!=t['w'].lower(): a+='('+t['l']+')'
        if t['m']: a+='.'+t['m']
        if t.get('u'): a+='~'+','.join(x[:3] for x in t['u'])
        if t['r']: a+='='+R[t['r']]
        if t.get('rn'): a+='=?'
        if t.get('rj'): a+='=rj:'+str(t['rj'])
        if t['g']: a+='>'+'/'.join(t['g'])
        if t.get('pg'): a+='+'+t['pg']
        out.append(a)
    ex=[]
    if s['slot'] is not None:
        n=s['need'] or []
        ex.append('need='+('ANY' if len(n)>=28 else 'CONCRETE' if len(n)>=19 else '|'.join(n) if n else 'none'))
        if s['fixed']: ex.append('FIXED')
    for q in ('rk','ps','nf','ku'):
        if q in s: ex.append(q+'='+str(s[q]))
    print(f"{i} L{s['lvl']} {s['t']}"+('  {'+' '.join(ex)+'}' if ex else '')+"\n   "+' '.join(out))
