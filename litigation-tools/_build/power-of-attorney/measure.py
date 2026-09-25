#!/usr/bin/env python3
"""measure.py <workdir>
Where does each kind of signature line sit? Word is the only authority on a
centred line of tabs, so the build asks it: fill.js writes measure.docx from
measure-state.json (fictional names), Word renders it (topdf.applescript), and
the words "ลงชื่อ" and the label after the underlined tabs give the line. The
name under it is centred on the same point:

    jc=center, ind left = L  →  centre = (L + W) / 2   with W = cell width − 2×108
    so L = 2c − W, where c is the line's centre from the cell's text edge.

The cell's text edge is where a half-width line starts (its first-line indent
is 0), so every figure is relative to the table itself. Writes out/geom.json.
"""
import json, os, re, subprocess, sys, html

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = sys.argv[1]
OUT = os.path.join(WORK, 'out')
docx, pdf, bbox = (os.path.join(WORK, 'measure.' + e) for e in ('docx', 'pdf', 'html'))

geom_path = os.path.join(OUT, 'geom.json')
if os.path.exists(geom_path): os.remove(geom_path)          # measure with the indents at 0
subprocess.run(['node', os.path.join(HERE, 'fill.js'), WORK, os.path.join(HERE, 'measure-state.json'), docx], check=True)
subprocess.run(['osascript', os.path.join(HERE, 'topdf.applescript'), docx, pdf], check=True)
subprocess.run(['pdftotext', '-bbox', pdf, bbox], check=True)

pages = re.findall(r'<page[^>]*>(.*?)</page>', open(bbox, encoding='utf8').read(), re.S)
words = []
for pi, pg in enumerate(pages):
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
        words.append((pi, float(m.group(1)), float(m.group(2)), float(m.group(3)), html.unescape(m.group(5))))

# pdftotext spells Thai loosely (a tone mark comes out as "%", SARA AM as NIKHAHIT + SARA AA),
# so words are matched on a stable prefix.
def kind(t):
    for pre, k in (('ลงชื', 'sign'), ('ผู้มอบ', 'ผู้มอบอำนาจ'), ('ผู้รับ', 'ผู้รับมอบอำนาจ'), ('พยาน', 'พยาน')):
        if t.startswith(pre): return k
lines = []                                    # (page, y, x_sign_end, x_label_start, label, x_sign_start)
for w in words:
    if kind(w[4]) != 'sign': continue
    after = [v for v in words if v[0] == w[0] and abs(v[2] - w[2]) < 2 and v[1] > w[3] and kind(v[4]) not in (None, 'sign')]
    lab = min(after, key=lambda v: v[1])
    lines.append((w[0], w[2], w[3], lab[1], kind(lab[4]), w[1]))
lines.sort()
print('signature lines found:', len(lines))
for l in lines: print('  p%d y=%.1f  %s  from %.1f  line %.1f–%.1f' % (l[0] + 1, l[1], l[4], l[5], l[2], l[3]))

# measure-state.json: one individual grantor (GI), three attorneys (a pair = H, one = F), two witnesses (W)
gi, h1, h2, f, w1, w2 = lines
origin = h1[5]                                # a half-width line starts at the cell's text edge
if abs(w1[5] - origin) > 0.6: sys.exit('witness line does not start at the cell edge: %.2f vs %.2f' % (w1[5], origin))
TW = 20.0
half, full = 4508 - 216, 9016 - 216
def L(line, width):
    c = ((line[2] + line[3]) / 2 - origin) * TW
    return int(round(2 * c - width))
geom = {'GI': L(gi, full), 'H': L(h1, half), 'F': L(f, full), 'W': L(w1, half)}
print('geom (twips):', geom)
json.dump(geom, open(geom_path, 'w'), indent=1)
