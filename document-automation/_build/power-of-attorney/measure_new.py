#!/usr/bin/env python3
"""measure_new.py <workdir>
Where does each kind of signature line of the current forms sit? As measure.py
does for the 2024 form, Word is asked: fill.js writes measure-<form>.docx from
measure-<form>.json (fictional names: a company with one director, three
attorneys, three witnesses), Word renders it (topdf.applescript), and the words
"ลงชื่อ" and the label after the underlined tab give each line. The name under
it is centred on the same point:

    jc=center, ind left = L  →  centre = (L + W) / 2   with W = cell width − 2×108
    so L = 2c − W, where c is the line's centre from the cell's text edge.

The cell's text edge is 3.85 pt left of where a half-width line starts (its
paragraph: left −113, first line +190 twips). Kinds: G1 (a lone grantor across
the table), H (attorneys in pairs), G1a (an odd attorney), W (witnesses, and
grantors, in pairs), G1w (an odd witness). A full-width line is centred, so its
middle moves with the label — each label is measured. Writes out/<form>/geom.json.
"""
import json, os, re, subprocess, sys, html

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = sys.argv[1]
TW = 20.0
EDGE = (-113 + 190) / TW                       # pt from the cell's text edge to a half-width line's start
HALF, FULL = 4508 - 216, 9016 - 216

def kind(t):
    for pre, k in (('ลงชื', 'sign'), ('ผู้มอบ', 'ผู้มอบอำนาจ'), ('ผู้รับ', 'ผู้รับมอบอำนาจ'), ('พยาน', 'พยาน')):
        if t.startswith(pre): return k

for form in ('th', 'thEn'):
    out = os.path.join(WORK, 'out', form)
    docx, pdf, bbox = (os.path.join(WORK, 'measure-%s.%s' % (form, e)) for e in ('docx', 'pdf', 'html'))
    geom_path = os.path.join(out, 'geom.json')
    if os.path.exists(geom_path): os.remove(geom_path)      # measure with the indents at 0
    subprocess.run(['node', os.path.join(HERE, 'fill.js'), WORK, os.path.join(HERE, 'measure-%s.json' % form), docx], check=True)
    subprocess.run(['osascript', os.path.join(HERE, 'topdf.applescript'), docx, pdf], check=True)
    subprocess.run(['pdftotext', '-bbox', pdf, bbox], check=True)
    pages = re.findall(r'<page[^>]*>(.*?)</page>', open(bbox, encoding='utf8').read(), re.S)
    words = []
    for pi, pg in enumerate(pages):
        for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
            words.append((pi, float(m.group(1)), float(m.group(2)), float(m.group(3)), html.unescape(m.group(5))))
    lines = []                                  # (page, y, x_sign_end, x_label_start, label, x_sign_start)
    for w in words:
        if kind(w[4]) != 'sign': continue
        after = [v for v in words if v[0] == w[0] and abs(v[2] - w[2]) < 2 and v[1] > w[3] and kind(v[4]) not in (None, 'sign')]
        lab = min(after, key=lambda v: v[1])
        lines.append((w[0], w[2], w[3], lab[1], kind(lab[4]), w[1]))
    lines.sort()
    print('%s: signature lines found: %d' % (form, len(lines)))
    for l in lines: print('  p%d y=%.1f  %-14s from %.1f  line %.1f–%.1f' % (l[0] + 1, l[1], l[4], l[5], l[2], l[3]))
    # measure-<form>.json: one director (G1), attorneys a pair (H) + one (G1a), witnesses a pair (W) + one (G1w)
    g1, h1, h2, g1a, w1, w2, g1w = lines
    origin = h1[5] - EDGE
    if abs(w1[5] - h1[5]) > 0.6: sys.exit('the witness line does not start where the attorney line does: %.2f vs %.2f' % (w1[5], h1[5]))
    def L(line, width):
        c = ((line[2] + line[3]) / 2 - origin) * TW
        return int(round(2 * c - width))
    geom = {'G1': L(g1, FULL), 'H': L(h1, HALF), 'G1a': L(g1a, FULL), 'W': L(w1, HALF), 'G1w': L(g1w, FULL)}
    print('  geom (twips):', geom)
    json.dump(geom, open(geom_path, 'w'), indent=1)
