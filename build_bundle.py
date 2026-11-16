# -*- coding: utf-8 -*-
"""Fold lexicon + sentences + semantics + definitions into one JS payload."""
import json, os, re, collections, noun_classes, adj_classes, definitions, vocab_filter

lex = json.load(open('lexicon.json'))
sents = json.load(open('sentences.json'))

# Corpus frequency: the score from freq_lemmas.json is attached to every word
# as `q`, and core/rarity.js turns it into a rarity tier. Homograph look-ups
# (*ljós* the adjective, *hreinn* the noun) have no score of their own and
# inherit the lemma's best score with a heavy discount: rarer than the reading
# the corpus saw, but not mythical.
HOMOGRAPH_DISCOUNT = 8

freq = json.load(open('freq_lemmas.json'))
score_of_id = {int(bid): rec[2] for bid, rec in freq.items()}

best_for_lemma = collections.defaultdict(int)
for w in lex['w']:
    s = score_of_id.get(w.get('i'))
    if s:
        best_for_lemma[w['o']] = max(best_for_lemma[w['o']], s)

inherited = []
for w in lex['w']:
    s = score_of_id.get(w.get('i'))
    if s is None:
        s = best_for_lemma.get(w['o'], 0) / HOMOGRAPH_DISCOUNT
        inherited.append('%s·%s→%.0f' % (w['o'], w['c'], s))
    # One decimal is plenty: the tier boundaries are 100/40/12/4/1.5 and no
    # boundary is decided by a hundredth of an occurrence.
    w['q'] = round(s, 1)

# Íslensk nútímamálsorðabók, if present (data/ino.json, written by
# tools/ino.mjs — see docs/DEFINITIONS.md). Joined on bin_id, so homographs get
# their own definitions. Two shapes are accepted: the flat `{bin_id: {...}}`
# map and the wrapped `{"entries": ..., "licence": ...}` the converter writes.
# From format 2 the converter records the word class, which is checked AGAIN
# here against the lexicon: a definition is never attached to a word of
# another class. A file without classes is trusted only for content words.
INO = {}
INO_FORMAT = 0
# The classes an unverifiable (format 1) file may still be trusted for. These
# are the ones that have a meaning to give; a function word's "definition" in
# ÍNO is usually its class name, which is also the answer to the question the
# child is being asked. See the header of src/js/core/definitions.js.
LEGACY_TRUSTED = {'kk', 'kvk', 'hk', 'lo', 'so', 'ao'}

if os.path.exists('data/ino.json'):
    raw = json.load(open('data/ino.json', encoding='utf-8'))
    INO = raw['entries'] if isinstance(raw.get('entries'), dict) else raw
    INO_FORMAT = raw.get('format', 0) if isinstance(raw, dict) else 0
    INO = {k: v for k, v in INO.items() if isinstance(v, dict) and v.get('def')}
    print('ÍNO found: %d entries (format %d)' % (len(INO), INO_FORMAT))
    if len(INO) < 100:
        print('  WARNING: that is far fewer than expected. Is data/ino.json the '
              'file tools/ino.mjs wrote? See docs/DEFINITIONS.md.')

# Helper nouns for the adjective table (adj_classes.py). Every one of them
# has to be a noun of the vocabulary with all sixteen forms, or a table would
# show a helper in some cells and none in others.
_noun_cells = {(w['o'], w['c']): sum(1 for c in str(w['f']).split(';') if c)
               for w in lex['w'] if w['c'] in ('kk', 'kvk', 'hk')}
_bad = sorted('%s (%s)' % h for h in adj_classes.helper_nouns() if _noun_cells.get(h, 0) < 16)
if _bad:
    raise SystemExit('adj_classes.py: hjálparorð vantar í orðaforðann eða hefur ekki '
                     'allar 16 myndirnar: ' + ', '.join(_bad))

hom = collections.Counter(w['o'] for w in lex['w'])
ino_rejected = collections.Counter()
for w in lex['w']:
    if w['c'] in ('kk', 'kvk', 'hk'):
        # semantic class, preposition convention and the frame exclusion —
        # see noun_classes.py
        w['s'] = noun_classes.klass(w['o'])
        p = noun_classes.prep(w['o'])
        if p:
            w['p'] = p
        if noun_classes.excluded(w['o']):
            w['nx'] = 1
        # not shown in the plural / with the article in a generated sentence
        if noun_classes.no_plural(w['o']):
            w['np'] = 1
        if noun_classes.no_article(w['o']):
            w['na'] = 1
    if w['c'] == 'lo':
        # the nouns the adjective table shows it with, "kk/kvk/hk" with "-"
        # for a gender it has none in; absent = shown without one
        three = adj_classes.helpers(w['o'])
        if three:
            w['h'] = '/'.join(n or '-' for n in three)
    ino = INO.get(str(w.get('i')))
    if ino and ino.get('def'):
        cls = ino.get('cls')
        if cls is not None and cls != w['c']:
            # tools/ino.mjs should already have made this impossible.
            ino, ino_rejected['class mismatch'] = None, ino_rejected['class mismatch'] + 1
        elif cls is None and w['c'] not in LEGACY_TRUSTED:
            ino, ino_rejected['unverifiable, function word'] = \
                None, ino_rejected['unverifiable, function word'] + 1
    if ino and ino.get('def'):
        w['d'], w['x'] = ino['def'], ino.get('example') or ''
        w['ds'] = 'ino'
    else:
        d = definitions.D.get(w['o'])
        if d:
            w['d'], w['x'] = d
            w['ds'] = 'hand'

if INO and INO_FORMAT < 2:
    print()
    print('  ' + '=' * 70)
    print('  data/ino.json was written by a version of tools/ino.mjs that did not')
    print('  record the word class, so this build CANNOT verify that a definition')
    print('  belongs to the word it is attached to.')
    print()
    print('  %d entries were dropped because they cannot be checked and their word'
          % sum(ino_rejected.values()))
    print('  class is one where a wrong definition is also the answer to a question.')
    print('  What remains is unverified: a noun definition may still be sitting on a')
    print('  verb of the same spelling (this is the *slá* fault).')
    print()
    print('  To fix it, once:   node tools/ino.mjs <the ÍNO .xml>  &&  ./build.sh')
    print('  ' + '=' * 70)
    print()
elif ino_rejected:
    print('ÍNO rejected:', dict(ino_rejected))

# A dictionary example that uses a blocked or UNFIT word is not shown (v6.13,
# item 9). The examples come from ÍNO, written for adults: *kæfa* had
# "morðinginn í myndinni kæfði konuna", *rannsókn* "rannsókn morðsins …".
# The word keeps its definition; only the example goes. Definitions are left
# alone and printed: there a word is used in its literal sense (*hún* "… t.d.
# stelpa eða tík", the dog), and tests/safevocab.test.js lists the ones
# allowed. A form that a kept word also has (*drullu*, the mud) does not count.
def _coarse_forms():
    """The forms an example may not contain. For a blocked word in the
    lexicon: its forms there, minus any form a kept word also has (*drullu*
    is the mud as well). For an UNFIT word, which never reaches the lexicon:
    the forms whose every BÍN reading is an UNFIT word (*morð*, not *ára*)."""
    from islenska import Bin
    b = Bin()
    blocked = lambda w: w['o'] in vocab_filter.BLOCK or (w['o'], w['c']) in vocab_filter.BLOCK_PAIRS
    cells = lambda w: {f.lower() for cell in str(w['f']).split(';') for f in cell.split('|') if f}
    kept, out = set(), set()
    for w in lex['w']:
        (out if blocked(w) else kept).update(cells(w) | ({w['o']} if blocked(w) else set()))
    out -= kept
    for lemma in sorted(vocab_filter.UNFIT):
        _, ms = b.lookup_lemmas(lemma)
        for bid in sorted({m.bin_id for m in ms if m.ord == lemma}):
            for f in {e.bmynd.lower() for e in b.lookup_id(bid)}:
                _, rs = b.lookup(f)
                if rs and all(r.ord in vocab_filter.UNFIT for r in rs) and f not in kept:
                    out.add(f)
    return out
_COARSE = _coarse_forms()
_words = lambda s: re.findall('[a-záðéíóúýþæö]+', str(s).lower())
# Definitions that tools/ino.mjs attached to the wrong sense, where the wrong
# sense is one a child should not be shown: *bera* the verb got ÍNO's *bera
# sig* ("láta sjást í nekt sína", "hún beraði brjóst sín") instead of "to
# carry". Dropped, definition and example, until the converter picks the
# right entry; the app asks no meaning question about a word without one.
WRONG_SENSE = {('bera', 'so')}
for w in lex['w']:
    if (w['o'], w['c']) in WRONG_SENSE and w.get('d'):
        print('definition dropped (wrong sense): %s·%s: %s' % (w['o'], w['c'], w['d']))
        for k in ('d', 'x', 'ds'):
            w.pop(k, None)

dropped_examples, coarse_defs = [], []
for w in lex['w']:
    if w['o'] in vocab_filter.BLOCK or (w['o'], w['c']) in vocab_filter.BLOCK_PAIRS:
        continue                      # hidden with its example
    if w.get('x') and any(t in _COARSE for t in _words(w['x'])):
        dropped_examples.append('%s: %s' % (w['o'], w['x']))
        w['x'] = ''
    if w.get('d') and any(t in _COARSE for t in _words(w['d'])):
        coarse_defs.append('%s: %s' % (w['o'], w['d']))
print('dictionary examples dropped for a blocked word: %d' % len(dropped_examples))
for x in dropped_examples: print('   ', x)
if coarse_defs:
    print('definitions that use a blocked word (kept; literal senses):')
    for x in coarse_defs: print('   ', x)

have = {w['o'] for w in lex['w']}
missing = [k for k in definitions.D if k not in have]

# The decency filter travels WITH the data rather than being applied to it.
# See the header of vocab_filter.py: the owner asked for a switch an
# administrator can set for one group and not another, and a build-time filter
# cannot be two things at once. It is on unless switched off (v6.13). Only
# lemmas the vocabulary actually contains are listed, so the list in the bundle
# is the useful part of it and no longer. An entry is a lemma (every word class
# it has) or "lemma|class" for one reading of a homograph (BLOCK_PAIRS) — the
# same key as `wordKey` in core/state.js.
have_lemmas = {w['o'] for w in lex['w']}
have_pairs = {(w['o'], w['c']) for w in lex['w']}
blocked = sorted([l for l in vocab_filter.BLOCK if l in have_lemmas]
                 + ['%s|%s' % p for p in vocab_filter.BLOCK_PAIRS if p in have_pairs])
print('vocabulary filter: %d of %d listed entries are in the corpus'
      % (len(blocked), len(vocab_filter.BLOCK) + len(vocab_filter.BLOCK_PAIRS)))

# Whether the definitions in this bundle could be CHECKED. `tools/ino.mjs`
# records the word class from format 2 onwards; without it, a definition may be
# sitting on a word of another class and nothing downstream can tell. The flag
# travels with the data so that `tests/definitions.test.js` can say which of the
# two rules it is entitled to assert, instead of asserting the strong one and
# failing on a bundle that is merely incomplete.
bundle = {'lex': lex, 'sent': sents, 'blocked': blocked,
          'defs': {'format': INO_FORMAT, 'verified': INO_FORMAT >= 2}}
js = ('export const DATA=' + json.dumps(bundle, ensure_ascii=False, separators=(',', ':'))
      + ';\nexport default DATA;\n')
open('data/data_bundle.js', 'w', encoding='utf-8').write(js)

print('definitions attached:', sum(1 for w in lex['w'] if w.get('d')),
      '(ÍNO %d, hand-written %d)' % (sum(1 for w in lex['w'] if w.get('ds') == 'ino'),
                                     sum(1 for w in lex['w'] if w.get('ds') == 'hand')),
      '| unused hand defs:', len(missing))
print('sentences:', len(sents), '| words:', len(lex['w']))
print('homograph lemmas:', sum(1 for k, v in hom.items() if v > 1),
      '| examples:', [k for k, v in hom.items() if v > 1][:12])

# Rarity bands, printed so that a build cannot quietly change how many words
# count as rare without anyone seeing it.
BANDS = [('Algengt', 100), ('Óalgengt', 40), ('Sjaldgæft', 12),
         ('Mjög sjaldgæft', 4), ('Sögulegt', 1.5), ('Goðsagnakennt', 0)]
counts = collections.Counter()
for w in lex['w']:
    for nm, lo in BANDS:
        if w['q'] >= lo:
            counts[nm] += 1
            break
n = len(lex['w'])
print('word rarity:', ' | '.join('%s %d (%.1f%%)' % (nm, counts[nm], 100 * counts[nm] / n)
                                 for nm, _ in BANDS))
print('inherited scores (%d):' % len(inherited), ' '.join(inherited))
print('bundle %.0f KB' % (os.path.getsize('data/data_bundle.js') / 1024))
print('sem:', dict(collections.Counter(w.get('s') for w in lex['w'] if w.get('s'))))
print('adjectives with a helper noun:', sum(1 for w in lex['w'] if w.get('h')),
      'of', sum(1 for w in lex['w'] if w['c'] == 'lo'))
print('excluded from frames:', sum(1 for w in lex['w'] if w.get('nx')), '| with í/á convention:', sum(1 for w in lex['w'] if w.get('p')),
      '| no plural:', sum(1 for w in lex['w'] if w.get('np')), '| no article:', sum(1 for w in lex['w'] if w.get('na')))
