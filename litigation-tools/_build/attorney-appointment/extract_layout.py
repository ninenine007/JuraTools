#!/usr/bin/env python3
"""Read each field's page position from Word's render of sent_<T>.docx (via pdftotext -bbox).

The sentinel file carries a unique token in every field; the engine's own `start`
for that token (sentinels.json) against the x Word actually drew it at gives the
page offset of the field's paragraph (page margin, table cell or text box).
"""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(os.path.join(HERE, 'out/spec.json'), encoding='utf8'))
sent = json.load(open(os.path.join(HERE, 'sentinels.json'), encoding='utf8'))
layout = {}
for T in ('JDA', 'PY'):
    pages = []
    src = open(os.path.join(HERE, 'sent_%s_bbox.html' % T), encoding='utf8').read()
    for m in re.finditer(r'<page |xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<', src):
        if m.group(0).startswith('<page'): pages.append([]); continue
        pages[-1].append((float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)), html.unescape(m.group(5))))
    L = {}
    for f in spec[T]:
        s = sent[T][f['id']]
        if f['kind'] == 'digits':
            by = {}
            for w in pages[f['page'] - 1]:
                if re.fullmatch('[๐-๙]', w[4]): by.setdefault(round(w[1]), []).append(w)
            line = sorted(max(by.values(), key=len)); assert len(line) == f['n'], len(line)
            L[f['id']] = {'page': f['page'], 'digits': [[round(w[0], 2), round(w[1], 2), round(w[3], 2)] for w in line]}
            continue
        hits = [(p, w) for p, pw in enumerate(pages) for w in pw if re.fullmatch(r'\(?' + s['tok'] + r'\)?', w[4])]
        assert len(hits) == 1, (T, f['id'], s['tok'], hits)
        p, w = hits[0]; assert p + 1 == f['page'], (f['id'], p)
        L[f['id']] = {'page': f['page'], 'ox': round(w[0] - s['start'] / 20.0, 3), 'y0': round(w[1], 2), 'y1': round(w[3], 2)}
    layout[T] = L
json.dump(layout, open(os.path.join(HERE, 'out/layout.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', {t: len(v) for t, v in layout.items()})
