# -*- coding: utf-8 -*-
"""Try candidate sentences before they go into the bank.

    python3 tools/try-sentences.py "Ég sá bílana í gær." bíll concrete
    python3 tools/try-sentences.py --skra candidates.txt
    python3 tools/try-sentences.py --gloppur          # what the bank is missing

Parses one sentence with the same `annotate` the build uses, and prints every
token with its word class and BÍN mark, whether the slot was found, whether it
is `fixed` (an adjective or pronoun beside it), the preposition it stands under
(`ps`) and the gender the sentence pins (`rk`).

A candidates file is one sentence per line, optionally
`sentence | lemma | need | level`. Lines beginning with `#` are ignored.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build_sentences  # noqa: E402
import noun_classes     # noqa: E402

CASES = ['NF', 'ÞF', 'ÞGF', 'EF']
COLS = ['ET', 'ETgr', 'FT', 'FTgr']
NOUN_MARKS = [c + col for c in CASES for col in COLS]


def load_bank():
    """Noun frames (mark, pinned gender, classes) and adjective marks the bank
    already has."""
    try:
        bank = json.load(open('sentences.json', encoding='utf-8'))
    except FileNotFoundError:
        return [], set()
    noun, adj = [], set()
    for s in bank:
        if s.get('slot') is not None and not s.get('fixed') and s.get('need'):
            t = s['tok'][s['slot']]
            if t.get('m') and not t.get('u') and t.get('c') == 'nafnorð':
                noun.append((t['m'], s.get('rk'), set(s['need']), s.get('ps')))
        for t in s['tok']:
            if t.get('c') == 'lýsingarorð' and t.get('m') and not t.get('u'):
                adj.add(t['m'])
    return noun, adj


def show(lvl, text, slot, need):
    rec = build_sentences.annotate(lvl, text, slot, need)
    if rec is None:
        print('  ✗ PARSE FAILURE:', text)
        return None
    print(f'  {text}')
    print(f'    lvl {rec["lvl"]}  slot={rec["slot"]}  fixed={rec["fixed"]}  '
          f'rk={rec.get("rk")}  ps={rec.get("ps")}  nf={rec.get("nf")}  '
          f'need={"|".join(rec["need"]) or "none"}')
    for i, t in enumerate(rec['tok']):
        if t['c'] is None:
            continue
        flag = ''
        if t.get('u'):
            flag = '  ÓVÍST: ' + ','.join(t['u'])
        if t.get('rj'):
            flag += '  [tekið úr umferð]'
        print(f'      {i:>2} {t["w"]:<16} {str(t["c"]):<16} {t.get("m") or "—":<18}{flag}')
    return rec


def guess_level(text):
    n = len(text.split())
    return 1 if n <= 5 else 2 if n <= 7 else 3 if n <= 9 else 4 if n <= 11 else 5


def gaps(have_noun, have_adj):
    """Which (mark, gender, class) combinations have no frame."""
    print('NOUN frames missing (mark · gender · class):')
    n = 0
    for m in NOUN_MARKS:
        for gender in ('kk', 'kvk', 'hk'):
            for cls in noun_classes.CLASSES:
                hit = any(fm == m and (rk is None or rk == gender) and cls in need
                          for fm, rk, need, _ps in have_noun)
                if not hit:
                    n += 1
                    print(f'   {m:<8} {gender:<4} {cls}')
    print(f'   -> {n} missing\n')
    degs = ['FSB', 'FVB', 'MST', 'ESB', 'EVB']
    missing = [f'{d}-{k}-{c}{num}' for d in degs for k in ('KK', 'KVK', 'HK')
               for c in CASES for num in ('ET', 'FT') if f'{d}-{k}-{c}{num}' not in have_adj]
    print('ADJECTIVE marks missing:', len(missing))
    for m in missing:
        print('   ', m)


def main(argv):
    have_noun, have_adj = load_bank()
    if '--gloppur' in argv:
        gaps(have_noun, have_adj)
        return

    items = []
    if '--skra' in argv:
        path = argv[argv.index('--skra') + 1]
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = [p.strip() for p in line.split('|')]
            text = parts[0]
            lemma = parts[1] if len(parts) > 1 and parts[1] else None
            need = parts[2] if len(parts) > 2 and parts[2] else None
            lvl = int(parts[3]) if len(parts) > 3 and parts[3] else guess_level(text)
            items.append((lvl, text, lemma, need))
    else:
        args = [a for a in argv[1:] if not a.startswith('--')]
        if not args:
            print(__doc__)
            return
        items.append((guess_level(args[0]), args[0],
                      args[1] if len(args) > 1 else None,
                      args[2] if len(args) > 2 else None))

    for lvl, text, lemma, need in items:
        show(lvl, text, lemma, need)
        print()


if __name__ == '__main__':
    main(sys.argv)
