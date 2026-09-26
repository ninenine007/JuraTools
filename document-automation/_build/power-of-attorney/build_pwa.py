#!/usr/bin/env python3
"""Build the template for document-automation/power-of-attorney.html
(หนังสือมอบอำนาจให้ฟ้องคดี) from the firm's two highlighted precedents.

    company.docx     the company-grantor precedent — the base document
    individual.docx  the individual-grantor precedent — its grantor paragraph,
                     its extra clause (a model for added clauses), its
                     "signatures on the next page" block and its signature rows

The user highlighted in yellow what is fixed wording; everything else varies
with the case. The highlight is the user's note, not part of the document, so
it is removed. Nothing else about a run is changed: each variable stretch
becomes a marker typed into its own first run, and that run's <w:rPr> is kept
byte for byte. Paragraphs and table rows are copied whole.

Every stretch is checked against sha256[:12] of the text it held, so a build
from a different file stops instead of cutting in the wrong place. The old
values themselves are never written anywhere.

    python3 build_pwa.py <workdir>      → <workdir>/out/frags.json, out/tpl.docx
    python3 build_pwa.py <workdir> --discover   prints runs and hashes
"""
import copy, hashlib, io, json, os, re, sys, zipfile
from lxml import etree

WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
W14 = '{http://schemas.microsoft.com/office/word/2010/wordml}'
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'

WORK = sys.argv[1] if len(sys.argv) > 1 else '.'
DISCOVER = '--discover' in sys.argv
LEARN = '--learn' in sys.argv          # print the hashes instead of checking them (first build from new files)
OUT = os.path.join(WORK, 'out')

def h(s):
    return hashlib.sha256(s.encode('utf8')).hexdigest()[:12]

def rtext(r):
    o = ''
    for c in r:
        t = c.tag.replace(W, '')
        if t == 't': o += c.text or ''
        elif t == 'tab': o += '\t'
        elif t == 'br': o += '\n'
    return o

def load(name):
    z = zipfile.ZipFile(os.path.join(WORK, name))
    raw = z.read('word/document.xml').decode('utf8')
    root = etree.fromstring(raw.encode('utf8'))
    clean(root)
    return z, raw, root

def clean(root):
    """Layout caches and invisible markers that would be wrong or unbalanced once
    paragraphs are copied: spell-check state, bookmarks (none is referenced by a
    field), rendered page breaks, and the paragraph ids Word regenerates."""
    for tag in ('proofErr', 'bookmarkStart', 'bookmarkEnd', 'lastRenderedPageBreak'):
        for el in root.iter(W + tag):
            el.getparent().remove(el)
    for el in root.iter():
        for a in (W14 + 'paraId', W14 + 'textId'):
            if a in el.attrib: del el.attrib[a]

def unhighlight(el):
    n = 0
    for hl in list(el.iter(W + 'highlight')):
        if hl.get(W + 'val') != 'yellow':
            sys.exit('unexpected highlight colour %r' % hl.get(W + 'val'))
        hl.getparent().remove(hl); n += 1
    return n

def body_children(root):
    return list(root.find(W + 'body'))

def paras(root):
    return [e for e in body_children(root) if e.tag == W + 'p']

def tables(root):
    return [e for e in body_children(root) if e.tag == W + 'tbl']

def ser(el):
    """Serialise one element without the namespace declarations lxml adds; the
    document root that receives it declares them."""
    s = etree.tostring(el, encoding='unicode')
    return re.sub(r'^(<[^>]+?)((?:\s+xmlns(?::\w+)?="[^"]*")+)', r'\1', s, count=1)

def show(label, p):
    print('--- %s' % label)
    for k, r in enumerate(p.findall(W + 'r')):
        hl = r.find(W + 'rPr/' + W + 'highlight') is not None
        t = rtext(r)
        print('  %2d %s %-14s %r' % (k, 'H' if hl else '.', h(t) if t else '', t))

LEAKS = []   # old values, collected for the local leak list (never written to the repo)

def mark(p, a, b, marker, expect, anchor=None):
    """Runs a..b of p held one variable value: keep one run (anchor, default a)
    with its rPr, make its content the marker, drop the rest. Returns the old text."""
    runs = p.findall(W + 'r')
    old = ''.join(rtext(r) for r in runs[a:b + 1])
    if LEARN:
        print('  %-12s runs %2d..%2d  %s  (was %s)' % (marker, a, b, h(old), expect))
    elif expect is not None and h(old) != expect:
        sys.exit('mark %s: runs %d..%d hold %s, expected %s — wrong source file?' % (marker, a, b, h(old), expect))
    keep = runs[anchor if anchor is not None else a]
    for c in list(keep):
        if c.tag != W + 'rPr': keep.remove(c)
    t = etree.SubElement(keep, W + 't'); t.set(XMLSPACE, 'preserve'); t.text = '⟦%s⟧' % marker
    for r in runs[a:b + 1]:
        if r is not keep: p.remove(r)
    LEAKS.append(old)
    return old

def rpr_of(p, k):
    rp = p.findall(W + 'r')[k].find(W + 'rPr')
    return ser(rp) if rp is not None else ''

def set_label(p, k, marker, expect_text):
    r = p.findall(W + 'r')[k]
    if rtext(r) != expect_text: sys.exit('label run %d is %r, expected %r' % (k, rtext(r), expect_text))
    for c in list(r):
        if c.tag != W + 'rPr': r.remove(c)
    t = etree.SubElement(r, W + 't'); t.set(XMLSPACE, 'preserve'); t.text = '⟦%s⟧' % marker

def center_name(p, kind):
    """A name under a signature line is centred on that line: jc=center with a
    left indent the build measures in Word (⟦IND:kind⟧, see measure.py). The
    drafters did the same by hand — every precedent row carries its own indent."""
    ppr = p.find(W + 'pPr')
    ind = ppr.find(W + 'ind')
    if ind is None:
        ind = etree.Element(W + 'ind')
        sp = ppr.find(W + 'spacing')
        (sp.addnext(ind) if sp is not None else ppr.insert(0, ind))
    for a in list(ind.attrib): del ind.attrib[a]
    ind.set(W + 'left', '⟦IND:%s⟧' % kind)
    jc = ppr.find(W + 'jc')
    if jc is None:
        jc = etree.Element(W + 'jc')
        ind.addnext(jc)
        cs = ppr.find(W + 'contextualSpacing')
        if cs is not None: cs.addnext(jc)
    jc.set(W + 'val', 'center')

def name_para(p, kind, expect):
    """'(' run, name runs, ')' run → '(' ⟦name⟧ ')'."""
    runs = p.findall(W + 'r')
    if rtext(runs[0]) != '(' or rtext(runs[-1]) != ')':
        sys.exit('name paragraph is not "(" … ")": %r' % [rtext(r) for r in runs])
    mark(p, 1, len(runs) - 2, 'name', expect)
    center_name(p, kind)
    return p

def cell_paras(tbl, r, c):
    tr = tbl.findall(W + 'tr')[r]
    tc = tr.findall(W + 'tc')[c]
    return tc.findall(W + 'p')

def tc_pr(tbl, r, c):
    return ser(tbl.findall(W + 'tr')[r].findall(W + 'tc')[c].find(W + 'tcPr'))

def tr_open(tbl, r):
    s = ser(tbl.findall(W + 'tr')[r])
    return s[:s.index('>') + 1]

# ─────────────────────────────────────────────────────────────────────────────
zc, raw_c, C = load('company.docx')
zi, raw_i, I = load('individual.docx')

if DISCOVER:
    for i, p in enumerate(paras(C)): show('company P%d' % i, p)
    for i, p in enumerate(paras(I)): show('individual P%d' % i, p)
    for ti, t in enumerate(tables(C) + tables(I)):
        for ri, tr in enumerate(t.findall(W + 'tr')):
            for ci, tc in enumerate(tr.findall(W + 'tc')):
                for pi, p in enumerate(tc.findall(W + 'p')):
                    if p.findall(W + 'r'): show('table%d r%d c%d p%d' % (ti, ri, ci, pi), p)
    sys.exit(0)

hl = unhighlight(C) + unhighlight(I)
PC, PI = paras(C), paras(I)
TC, TI = tables(C), tables(I)

# Structure check: the body is what this script expects.
def shape(root):
    return ''.join('p' if e.tag == W + 'p' else 't' if e.tag == W + 'tbl' else 's' for e in body_children(root))
if shape(C) != 'ppppt' + 'p' * 12 + 'tps': sys.exit('company.docx body is not the expected shape: ' + shape(C))
if shape(I) != 'ppppt' + 'p' * 16 + 'tpps': sys.exit('individual.docx body is not the expected shape: ' + shape(I))

F = {}
alt = {}

# ── Heading: title, place, date (company precedent) ──
F['title'] = ser(PC[0])
mark(PC[1], 3, 8, 'place', '6c186efe07a7')                              # run 2, the space after ทำที่, stays
F['place'] = ser(PC[1])
mark(PC[2], 0, 3, 'date', 'dbda606634fc')
F['date'] = ser(PC[2])

# ── Grantor paragraph: company form ("โดยหนังสือฉบับนี้ ⟦grantor⟧(“ผู้มอบอำนาจ”) ขอมอบอำนาจ…") ──
alt['grantor.company'] = rpr_of(PC[3], 3)                      # the name, in bold
mark(PC[3], 3, 23, 'grantor', 'c4c21d394ad3', anchor=4)               # the rest, regular; run 24 (space) stays
F['grantor.company'] = ser(PC[3])

# ── Grantor paragraph: individual form ("โดยหนังสือฉบับนี้ ข้าพเจ้า ⟦grantor⟧(“ผู้มอบอำนาจ”)⟦tail⟧ขอมอบอำนาจ…") ──
alt['grantor.individual'] = rpr_of(PI[3], 3)
mark(PI[3], 16, 41, 'tail', 'f367355648bf')                              # run 15 (space) stays
mark(PI[3], 3, 10, 'grantor', '3bb3d68f6211', anchor=5)                 # run 11 (space) stays
F['grantor.individual'] = ser(PI[3])

# ── Attorney table: header row kept, one data row as the model ──
att = TC[0]
rows = att.findall(W + 'tr')
row = copy.deepcopy(rows[1])
for tr in rows[1:]: att.remove(tr)
s = ser(att)
F['attTable'] = s.replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
cells = row.findall(W + 'tc')
p0, p1, p2 = (c.find(W + 'p') for c in cells)
mark(p0, 0, len(p0.findall(W + 'r')) - 1, 'no', 'c977dbe78522')
mark(p1, 0, len(p1.findall(W + 'r')) - 1, 'name', 'c6aea85c441a')
mark(p2, 0, len(p2.findall(W + 'r')) - 1, 'id', '9a63b981bc13')
F['attRow'] = ser(row)

# ── "ซึ่งต่อไป… ที่เกี่ยวข้องกับ ⟦counterparty⟧(“คู่กรณี”)⟦claim⟧(“⟦term⟧”)" ──
mark(PC[4], 32, 32, 'termDef', '15d70733b71d')
mark(PC[4], 19, 30, 'claim', '3abc3ee57b45')                             # run 18 (space) stays
mark(PC[4], 11, 11, 'counterparty', '83120f4bc566')                      # run 12 (bold space) stays
F['intro'] = ser(PC[4])
F['scope'] = ser(PC[5])                                        # "ทั้งนี้ ให้ผู้รับมอบอำนาจมีอำนาจ…"

# ── The nine standard clauses (company precedent; numbering is Word's own list) ──
mark(PC[6], 8, 9, 'term', 'fa5030fb1177')
mark(PC[6], 5, 6, 'court', '592a9e115f4f')
mark(PC[11], 6, 7, 'term', 'fa5030fb1177')                               # run 8 (space) stays
F['clauses'] = [ser(p) for p in PC[6:14]]
if len(F['clauses']) != 8: sys.exit('expected 8 standard clauses')

# ── An added clause takes the individual precedent's own added clause (its ข้อ 4) ──
mark(PI[9], 0, len(PI[9].findall(W + 'r')) - 1, 'text', '210ade8aa18d')
F['extraClause'] = ser(PI[9])

F['closing'] = ser(PC[14])
F['sigLead.samePage'] = ser(PC[15])
F['sigLead.nextPage'] = ''.join(ser(p) for p in PI[16:20])  # note, page break, two blank lines

# ── Signature table: grid kept, rows rebuilt from the precedents' own rows ──
sigC, sigI = TC[1], TI[1]
tbl = copy.deepcopy(sigC)
for tr in tbl.findall(W + 'tr'): tbl.remove(tr)
F['sigTable'] = ser(tbl).replace('</w:tbl>', '⟦ROWS⟧</w:tbl>')
F['tr'] = tr_open(sigI, 2)
F['tcHalf'] = tc_pr(sigI, 1, 0)
F['tcFull'] = tc_pr(sigI, 0, 0)

S = {}
# individual precedent, row 0: the grantor alone, full width, line centred
g = cell_paras(sigI, 0, 0)
S['GI.blank'] = ser(g[0]); S['GI.sig'] = ser(g[1]); S['GI.name'] = ser(name_para(g[2], 'GI', '74026df81da9'))
# company precedent, row 0: company name, two blank lines, the director's line
g = cell_paras(sigC, 0, 0)
mark(g[0], 0, 0, 'company', 'e65161384823')
S['GC.company'] = ser(g[0]); S['GC.blank'] = ser(g[1]); S['GC.sig'] = ser(g[3])
S['GC.name'] = ser(name_para(g[4], 'GI', '5abcb1feac3a'))
norsid = lambda x: re.sub(r' w:rsid\w*="[0-9A-F]+"', '', x)
if norsid(S['GC.sig']) != norsid(S['GI.sig']): sys.exit('the company and individual grantor lines differ')
# individual precedent, row 1: a pair of half-width cells
g = cell_paras(sigI, 1, 0)
S['H.blank'] = ser(g[0])
set_label(g[2], 5, 'label', 'ผู้รับมอบอำนาจ'); S['H.sig'] = ser(g[2])
S['H.name'] = ser(name_para(g[3], 'H', 'c6aea85c441a'))
S['H.trail'] = ser(cell_paras(sigI, 1, 1)[4])
# row 3: one signer across the full width
g = cell_paras(sigI, 3, 0)
set_label(g[0], 6, 'label', 'ผู้รับมอบอำนาจ'); S['F.sig'] = ser(g[0])
S['F.name'] = ser(name_para(g[1], 'F', 'd25963c3f671'))
S['F.trail'] = ser(g[2])
# row 4: the witnesses
g = cell_paras(sigI, 4, 0)
S['W.sig'] = ser(g[0]); S['W.name'] = ser(name_para(g[1], 'W', 'f2fdd09941c7')); S['W.trail'] = ser(g[2])
F['sig'] = S

# ── "-ติดอากรแสตมป์ ⟦stamp⟧ บาท-" ──
mark(PC[16], 2, 3, 'stamp', '69f59c273b6e')
F['stamp'] = ser(PC[16])

# ── Head and tail of document.xml, verbatim from the company precedent ──
F['head'] = raw_c[:raw_c.index('<w:body>') + len('<w:body>')]
F['tail'] = ser(body_children(C)[-1]) + '</w:body></w:document>'

# Every marker must survive exactly where it was put.
blob = json.dumps(F, ensure_ascii=False)
for m in ('place', 'date', 'grantor', 'tail', 'no', 'name', 'id', 'counterparty', 'claim', 'termDef', 'term', 'court',
          'text', 'company', 'label', 'stamp', 'ROWS'):
    if '⟦%s⟧' % m not in blob: sys.exit('marker %s lost' % m)
if 'w:highlight' in blob: sys.exit('a highlight survived')

# ── The package: the company precedent, author fields blanked, page total live ──
def package():
    out = io.BytesIO(); zo = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for it in zc.infolist():
        data = zc.read(it.filename)
        if it.filename == 'word/document.xml':
            data = (F['head'] + '⟦BODY⟧' + F['tail']).encode('utf8')
        elif it.filename == 'docProps/core.xml':
            for tag in (rb'dc:creator', rb'cp:lastModifiedBy'):
                data = re.sub(rb'<' + tag + rb'>[^<]*</' + tag + rb'>', b'<' + tag + b'></' + tag + b'>', data)
        elif it.filename == 'word/footer1.xml':
            data = numpages(data.decode('utf8')).encode('utf8')
        zo.writestr(it, data)
    zo.close(); return out.getvalue()

def numpages(x):
    """The footer reads "หน้า {PAGE} ของ 3" with the 3 typed by hand, so every
    precedent had to be corrected by hand. It becomes Word's own NUMPAGES field,
    in the same run properties, so the total is always right."""
    run = re.search(r'<w:r(?: [^>]*)?><w:rPr>(<w:noProof/><w:sz w:val="26"/><w:szCs w:val="26"/>)</w:rPr><w:t>\d+</w:t></w:r>(?=</w:p>)', x)
    if not run: sys.exit('footer: the typed page total was not found')
    rp = '<w:rPr>%s</w:rPr>' % run.group(1)
    fld = ''.join('<w:r>%s%s</w:r>' % (rp, c) for c in (
        '<w:fldChar w:fldCharType="begin"/>',
        '<w:instrText xml:space="preserve"> NUMPAGES   \\* MERGEFORMAT </w:instrText>',
        '<w:fldChar w:fldCharType="separate"/>',
        '<w:t>3</w:t>',
        '<w:fldChar w:fldCharType="end"/>'))
    return x[:run.start()] + fld + x[run.end():]

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'tpl.docx'), 'wb').write(package())
json.dump({'frags': F, 'alt': alt}, open(os.path.join(OUT, 'frags.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
json.dump(sorted(set(LEAKS)), open(os.path.join(OUT, 'old-values.local.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('highlights removed:', hl)
print('wrote', os.path.join(OUT, 'frags.json'), 'and tpl.docx;', len(LEAKS), 'old values listed in out/old-values.local.json (local only)')
